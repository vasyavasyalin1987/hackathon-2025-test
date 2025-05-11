const express = require("express");
const app = express();
const port = 3334;
const httpPort = 3001; // Порт для HTTP
const path = require("path");
const https = require("https");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
	client,
	disconnectFromDatabase,
	connectToDatabase,
} = require("./app/models/client");
const {
	authenticateUser,
	registerUser,
	isAuthenticated,
	deleteUser,
	logoutUser,
} = require("./app/controllers/auth");
const session = require("express-session");
const { Account, Dish, Favorites } = require("./app/models/modelsDB");
const privateKey = fs.readFileSync("localhost+2-key.pem");
const certificate = fs.readFileSync("localhost+2.pem");
const { Op, where } = require("sequelize");
const { count } = require("console");
const passport = require("passport");
app.use(passport.initialize());
app.use(express.json());
app.use(
	session({
		secret: "pAssW0rd", // Секретный ключ
		resave: false,
		saveUninitialized: true,
		cookie: { secure: true }, //  Устанавливаем secure: true для HTTPS
	})
);

// Маршрут для регистрации
app.post("/register", async (req, res) => {
	const { login, password } = req.body;

	if (!login || !password) {
		return res.status(400).json({ message: "Не все поля указаны" });
	}

	const result = await registerUser({ login, password });

	if (result.success) {
		res.json(result.user);
	} else {
		res.status(400).json({ message: result.message });
	}
});

// Маршрут для логина
app.post("/login", async (req, res) => {
	const { login, password } = req.body;
	const result = await authenticateUser(login, password);

	if (result.success) {
		res.json(result.user);
	} else {
		res.status(401).json({ message: result.message });
	}
});

// Маршрут для выхода
app.post("/logout", logoutUser);

// Просмотр всех блюд (public)
app.get("/dishes", async (req, res) => {
	try {
		const dishes = await Dish.findAll({
			attributes: ["id", "naim", "description", "cooking_time"],
		});
		res.json(dishes);
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Поиск по ключевым словам (public)
app.get("/dishes/search", async (req, res) => {
	const { query } = req.query;
	if (!query)
		return res.status(400).json({ error: "Query parameter is required" });

	try {
		const dishes = await Dish.findAll({
			where: {
				[Op.or]: [
					{ naim: { [Op.iLike]: `%${query}%` } },
					{ description: { [Op.iLike]: `%${query}%` } },
				],
			},
			attributes: ["id", "naim", "description", "cooking_time"],
		});
		res.json(dishes);
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Подробная информация о блюде (public, with isFavorited)
app.get("/dishes/:id", isAuthenticated, async (req, res) => {
	const { id } = req.params;
	const { people } = req.query; // Optional: number of people for cost calculation

	try {
		const dish = await Dish.findByPk(id, {
			include: [{ model: Account, as: "account", attributes: ["login"] }],
		});
		if (!dish) return res.status(404).json({ error: "Dish not found" });

		// Check if the dish is favorited by the authenticated user
		let isFavorited = false;
		if (req.user) {
			const favorite = await Favorites.findOne({
				where: {
					id_acc: req.user.id,
					id_dish: id,
				},
			});
			isFavorited = !!favorite;
		}

		// Calculate cost based on ingredients (example logic)
		let cost = 0;
		if (dish.ingredients && people) {
			const numPeople = parseInt(people, 10) || 1;
			cost = Object.values(dish.ingredients).reduce(
				(total, ingredient) => {
					return total + (ingredient.price || 0) * numPeople;
				},
				0
			);
		}

		res.json({ ...dish.toJSON(), cost, isFavorited });
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Создание нового блюда (authenticated)
app.post("/dishes", isAuthenticated, async (req, res) => {
	const { naim, description, cooking_time, ingredients } = req.body;
	if (!naim) return res.status(400).json({ error: "Dish name is required" });

	try {
		const dish = await Dish.create({
			id_acc: req.user.id,
			naim: naim,
			description: description,
			cooking_time: cooking_time,
			ingredients: ingredients,
		});
		res.status(201).json(dish);
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Обновление блюда (authenticated, только собственные блюда)
app.put("/dishes/:id", isAuthenticated, async (req, res) => {
	const { id } = req.params;
	const { naim, description, cooking_time, ingredients } = req.body;

	try {
		const dish = await Dish.findByPk(id);
		if (!dish) return res.status(404).json({ error: "Dish not found" });
		if (dish.id_acc !== req.user.id)
			return res.status(403).json({ error: "Not authorized" });

		await dish.update({ naim, description, cooking_time, ingredients });
		res.json(dish);
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Удаление блюда (authenticated, только собственные блюда)
app.delete("/dishes/:id", isAuthenticated, async (req, res) => {
	const { id } = req.params;

	try {
		const dish = await Dish.findByPk(id);
		if (!dish) return res.status(404).json({ error: "Dish not found" });
		if (dish.id_acc !== req.user.id)
			return res.status(403).json({ error: "Not authorized" });

		await dish.destroy();
		res.status(204).send();
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Добавление блюда в избранные (authenticated)
app.post("/favorites/:dishId", isAuthenticated, async (req, res) => {
	const { dishId } = req.params;

	try {
		const dish = await Dish.findByPk(dishId);
		if (!dish) return res.status(404).json({ error: "Dish not found" });

		const existingFavorite = await Favorites.findOne({
			where: { id_acc: req.user.id, id_dish: dishId },
		});
		if (existingFavorite)
			return res.status(400).json({ error: "Dish already in favorites" });

		const favorite = await Favorites.create({
			id_acc: req.user.id,
			id_dish: dishId,
		});
		res.status(201).json(favorite);
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Удаление блюда из списка избранных (authenticated)
app.delete("/favorites/:dishId", isAuthenticated, async (req, res) => {
	const { dishId } = req.params;

	try {
		const favorite = await Favorites.findOne({
			where: { id_acc: req.user.id, id_dish: dishId },
		});
		if (!favorite)
			return res.status(404).json({ error: "Favorite not found" });

		await favorite.destroy();
		res.status(204).send();
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
});

// Получение списка избранных блюд (authenticated)
app.get("/favorites", isAuthenticated, async (req, res) => {
	if (!req.user) {
		return res.status(401).json({ error: "Authentication required" });
	}

	try {
		const favorites = await Favorites.findAll({
			where: { id_acc: req.user.id },
			include: [
				{
					model: Dish,
					as: "dish",
					attributes: [
						"id",
						"naim",
						"description",
						"cooking_time",
						"ingredients",
					],
					include: [
						{
							model: Account,
							as: "account",
							attributes: ["login"],
						},
					],
				},
			],
		});

		// Map favorites to include dish details and isFavorited: true
		const favoriteDishes = favorites.map((fav) => ({
			...fav.dish.toJSON(),
			isFavorited: true,
		}));

		res.json(favoriteDishes);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Рекомендации по блюду (authenticated)
app.get("/recommendations/:id", isAuthenticated, async (req, res) => {
	const { id } = req.params;

	try {
		// Fetch the target dish
		const targetDish = await Dish.findByPk(id, {
			attributes: ["id", "ingredients"],
		});
		if (!targetDish)
			return res.status(404).json({ error: "Dish not found" });
		if (!targetDish.ingredients)
			return res
				.status(400)
				.json({ error: "No ingredients available for this dish" });

		// Extract ingredients from the target dish
		const targetIngredients = new Map();
		Object.entries(targetDish.ingredients).forEach(([name, details]) => {
			targetIngredients.set(name, details.quantity || 1);
		});

		// Query all other dishes (excluding the target dish)
		const allDishes = await Dish.findAll({
			where: {
				id: { [Op.ne]: id },
			},
			attributes: [
				"id",
				"naim",
				"description",
				"cooking_time",
				"ingredients",
			],
		});

		// Calculate similarity scores based on ingredient overlap
		const recommendations = allDishes.map((dish) => {
			let score = 0;
			if (dish.ingredients) {
				const dishIngredients = new Set(Object.keys(dish.ingredients));
				let totalOverlap = 0;
				let quantityDiff = 0;

				targetIngredients.forEach((targetQty, ingredient) => {
					if (dishIngredients.has(ingredient)) {
						totalOverlap++;
						const dishQty =
							dish.ingredients[ingredient].quantity || 1;
						// Penalize quantity differences
						quantityDiff +=
							Math.abs(targetQty - dishQty) /
							Math.max(targetQty, dishQty);
					}
				});

				// Similarity score: proportion of overlapping ingredients, adjusted for quantity differences
				const overlapRatio =
					totalOverlap /
					(dishIngredients.size +
						targetIngredients.size -
						totalOverlap);
				score =
					overlapRatio *
					(1 - (totalOverlap ? quantityDiff / totalOverlap : 0));
			}
			return { dish, score };
		});

		// Sort by score and limit to top 5 recommendations
		const sortedRecommendations = recommendations
			.sort((a, b) => b.score - a.score)
			.slice(0, 5)
			.map((item) => item.dish);

		res.json(sortedRecommendations);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Internal server error" });
	}
});

http.createServer(app).listen(port, () => {
	console.log(`HTTP-сервер запущен на http://localhost:${port}`);
});

process.on("SIGINT", async () => {
	//  Ctrl+C
	try {
		console.log("Получен сигнал SIGINT. Завершение работы...");
		await disconnectFromDatabase();
	} catch (error) {
		console.error("Ошибка при отключении от БД:", error);
	} finally {
		process.exit();
	}
});

process.on("SIGTERM", async () => {
	//  `kill` command
	try {
		console.log("Получен сигнал SIGTERM. Завершение работы...");
		await disconnectFromDatabase();
	} catch (error) {
		console.error("Ошибка при отключении от БД:", error);
	} finally {
		process.exit();
	}
});
