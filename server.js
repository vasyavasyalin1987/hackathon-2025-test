const express = require("express");
const app = express();
const port = 3333;
const httpPort = 3001; // Порт для HTTP
const path = require("path");
const https = require("https");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const {
	client,
	disconnectFromDatabase,
	connectToDatabase,
} = require("./app/models/client");
const { authenticateUser, logoutUser } = require("./app/controllers/auth");
const session = require("express-session");
const {
	sequelize,
	Role,
	Account,
	Partner,
	Bonus,
	Volonter,
	NachBonus,
	Category,
} = require("./app/models/modelsDB");
const privateKey = fs.readFileSync("localhost+2-key.pem");
const certificate = fs.readFileSync("localhost+2.pem");
const { Op, where } = require("sequelize");
const { count } = require("console");
const passport = require("passport");
app.use(express.json());
app.use(
	session({
		secret: "pAssW0rd", // Секретный ключ
		resave: false,
		saveUninitialized: true,
		cookie: { secure: true }, //  Устанавливаем secure: true для HTTPS
	})
);

function generatePassword() {
	var length = 8,
		charset =
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	res = "";
	for (var i = 0, n = charset.length; i < length; ++i) {
		res += charset.charAt(Math.floor(Math.random() * n));
	}
	return res;
}

const isAdmin = async (req, res, next) => {
	// Проверка на администратора
	try {
		token_body = req.headers.token;

		const acc = await Account.findOne({
			where: {
				token: token_body,
			},
		});

		if (acc.role_id == 1) {
			return next();
		}
	} catch {
		res.sendStatus(403);
	}
	res.sendStatus(403);
};

const isPartner = async (req, res, next) => {
	// Проверка на предприятия-партнёра
	try {
		token_body = req.headers.token;

		const acc = await Account.findOne({
			where: {
				token: token_body,
			},
		});

		if (acc.role_id == 2) {
			return next();
		}
	} catch {
		res.sendStatus(403);
	}
	res.sendStatus(403);
};

const isVolonter = async (req, res, next) => {
	// Проверка на волонтёра
	try {
		token_body = req.headers.token;

		const acc = await Account.findOne({
			where: {
				token: token_body,
			},
		});

		if (acc.role_id == 3) {
			return next();
		}
	} catch {
		res.sendStatus(403);
	}
	res.sendStatus(403);
};

app.post("/add_bonus", isAdmin, async (req, res) => {
	try {
		// Логируем тело запроса для диагностики
		console.log("Received request body:", req.body);

		// Проверяем, что тело запроса существует
		if (!req.body) {
			return res.status(400).json({ error: "Request body is empty" });
		}

		const bonuses = req.body;

		// Проверяем, что данные — это массив и он содержит ровно 150 элементов
		if (!Array.isArray(bonuses) || bonuses.length !== 150) {
			return res
				.status(400)
				.json({ error: "Expected an array of 150 bonuses" });
		}

		const results = []; // Для хранения результатов
		let categoryId;

		// Обрабатываем каждый бонус
		for (let i = 0; i < bonuses.length; i++) {
			const bonusData = bonuses[i];

			// Проверяем, что все необходимые поля присутствуют
			if (
				!bonusData.fullName ||
				!bonusData.inn ||
				!bonusData.phone ||
				!bonusData.email ||
				!bonusData.birthDate ||
				!bonusData.achievements
			) {
				return res
					.status(400)
					.json({ error: `Missing required fields at index ${i}` });
			}

			// Определяем категорию на основе индекса
			if (i < 50) {
				categoryId = 1; // С 1 по 50 — категория A
			} else if (i < 100) {
				categoryId = 2; // С 51 по 100 — категория Б
			} else {
				categoryId = 3; // Остальные — категория В
			}

			// Преобразуем birthDate в формат, подходящий для базы данных
			const [day, month, year] = bonusData.birthDate.split(".");
			const formattedBirthDate = `${year}-${month}-${day}`;

			// Ищем волонтера
			let volonter = await Volonter.findOne({
				where: {
					fio: bonusData.fullName,
					inn: bonusData.inn,
					tel: bonusData.phone,
					DOB: formattedBirthDate,
				},
				include: [{ model: Account, as: "account" }],
			});

			await Volonter.update({
				where: {
					fio: bonusData.fullName,
					inn: bonusData.inn,
					tel: bonusData.phone,
					DOB: formattedBirthDate,
				},
			});

			if (!volonter) {
				acc = await Account.create({
					login: bonusData.email,
					password: generatePassword(),
				});

				volonter = await Volonter.create({
					id_acc: acc.id,
					fio: bonusData.fullName,
					inn: bonusData.inn,
					tel: bonusData.phone,
					DOB: bonusData.formattedBirthDate,
				});
			}

			// Ищем бонус
			const bonusRecord = await Bonus.findOne({
				where: { naim: bonusData.achievements },
			});

			if (!bonusRecord) {
				continue;
			}

			// Создаем запись в таблице NachBonus
			const newNachBonus = await NachBonus.create({
				id_bonus: bonusRecord.id, // Используем id бонуса
				date_nach: new Date(),
				id_volonter: volonter.id,
			});

			results.push({
				id: newNachBonus.id,
				bonus_id: newNachBonus.id_bonus,
				volunteer_id: newNachBonus.id_volonter,
				date_nach: newNachBonus.date_nach,
			});
		}

		res.status(201).json({
			message: "Bonuses added successfully",
			data: results,
		});
	} catch (error) {
		console.error("Error adding bonuses:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.get("/all_bonuses", isAdmin, async (req, res) => {
	try {
		// Fetch all bonuses without filtering by is_expired in the database
		const bonuses = await NachBonus.findAll({
			include: [
				{
					model: Bonus,
					as: "bonus",
					include: [
						{
							model: Partner,
							as: "partner",
							attributes: [["naim", "partner_name"]],
						},
						{
							model: Category,
							as: "category",
							attributes: [["naim", "category_name"]],
						},
					],
					attributes: ["id", ["naim", "bonus_name"], "count"],
				},
				{
					model: Volonter,
					as: "volonter",
					attributes: ["fio", "tel"],
					include: [
						{
							model: Account,
							as: "account",
							attributes: [
								["login", "account_login"],
								"mail",
								"dost",
							],
						},
					],
				},
			],
			attributes: ["id", "id_bonus", "date_nach"],
		});

		// Split bonuses into active and expired based on is_expired virtual field
		/*const activeBonuses = bonuses.filter(
				(nachBonus) => !nachBonus.is_expired
			);
			const expiredBonuses = bonuses.filter(
				(nachBonus) => nachBonus.is_expired
			);

			// Form the response
			const result = {
				resultBonus: activeBonuses.map((nachBonus) => ({
					bonus_id: 2147483647 - nachBonus.id_bonus,
					bonus_name: nachBonus.bonus.bonus_name,
					partner: nachBonus.bonus.partner.partner_name,
					category: nachBonus.bonus.category?.category_name || null,
					count: nachBonus.bonus.count,
					time_received: nachBonus.date_nach,
					volonter: {
						full_name: nachBonus.volonter?.fio || null,
						tel: nachBonus.volonter?.tel || null,
						account_login:
							nachBonus.volonter?.account?.account_login || null,
					},
				})),
				resultExpiredBonus: expiredBonuses.map((nachBonus) => ({
					bonus_id: 2147483647 - nachBonus.id_bonus,
					bonus_name: nachBonus.bonus.bonus_name,
					partner: nachBonus.bonus.partner.partner_name,
					category: nachBonus.bonus.category?.category_name || null,
					count: nachBonus.bonus.count,
					time_received: nachBonus.date_nach,
					volonter: {
						full_name: nachBonus.volonter?.fio || null,
						tel: nachBonus.volonter?.tel || null,
						account_login:
							nachBonus.volonter?.account?.account_login || null,
					},
				})),
			};*/

		res.status(200).json(bonuses);
	} catch (error) {
		console.error("Error fetching bonuses:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.post("/bonuses_volonter", isVolonter, async (req, res) => {
	// Бонусы полученные волонтёром
	try {
		const { accountId } = req.body;

		if (!accountId) {
			return res.status(400).json({ error: "Account ID is required" });
		}

		// Проверяем, является ли аккаунт волонтером
		const volonter = await Volonter.findOne({
			where: { id_acc: accountId },
		});

		if (!volonter) {
			return res.status(403).json({ error: "User is not a volunteer" });
		}

		const bonuses = await NachBonus.findAll({
			where: {
				id_volonter: volonter.id,
			},
			include: [
				{
					model: Bonus,
					as: "bonus",
					include: [
						{
							model: Partner,
							as: "partner",
							attributes: [["naim", "partner_name"]], // Переименовываем naim в partner_name
						},
						{
							model: Category,
							as: "category",
							attributes: [["naim", "category_name"]], // Переименовываем naim в category_name
						},
					],
					attributes: ["id", "naim", "count"],
				},
			],
			attributes: ["id_bonus", "date_nach"],
		});

		// Формируем ответ
		const result = {
			resultBonus: bonuses.map((nachBonus) => ({
				bonus_id: 2147483647 - nachBonus.id_bonus, // Генерация идентификатора бонуса исходя из значения id и его максильного значения
				bonus_name: nachBonus.bonus.naim,
				partner: nachBonus.bonus.partner.naim,
				category: nachBonus.bonus.category?.naim || null,
				count: nachBonus.bonus.count,
				time_received: nachBonus.date_nach,
			})),
		};

		res.status(200).json(result);
	} catch (error) {
		console.error("Error fetching bonuses:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.post("/bonuses_partner", isPartner, async (req, res) => {
	try {
		// Получаем ID авторизированного пользователя
		const userId = req.session.user.id;

		// Находим аккаунт пользователя и проверяем, что роль партнера (id = 2)
		const account = await Account.findOne({
			where: {
				id: userId,
				role_id: 2,
			},
			include: [
				{
					model: Partner,
					as: "partner",
				},
			],
		});

		// Проверяем, существует ли аккаунт и связанный партнер
		if (!account || !account.partner) {
			return res
				.status(403)
				.json({ error: "Пользователь не является партнером" });
		}

		// Получаем все бонусы партнера
		const bonuses = await Bonus.findAll({
			where: {
				id_partner: account.partner.id,
			},
			include: [
				{
					model: Category,
					as: "category",
					attributes: [["naim", "category_name"]], // Переименовываем naim в category_name
				},
			],
			attributes: ["id", "naim", "count", "id_category"],
		});

		// Формируем ответ
		res.json(bonuses);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Внутренняя ошибка сервера" });
	}
});

app.post("/add_bonuse_partner", isPartner, async (req, res) => {
	try {
		// Получаем ID авторизированного пользователя
		const userId = req.session.user.id;

		// Проверяем, что пользователь является партнером (role_id = 2)
		const account = await Account.findOne({
			where: {
				id: userId,
				role_id: 2,
			},
			include: [
				{
					model: Partner,
					as: "partner",
				},
			],
		});

		// Проверяем, существует ли аккаунт и связанный партнер
		if (!account || !account.partner) {
			return res
				.status(403)
				.json({ error: "Пользователь не является партнером" });
		}

		// Получаем данные из тела запроса
		const { naim, count } = req.body;

		// Валидация входных данных
		if (!naim || typeof naim !== "string" || naim.trim() === "") {
			return res.status(400).json({
				error: "Название бонуса обязательно и должно быть строкой",
			});
		}
		if (count < 0) {
			return res.status(400).json({
				error: "Значение бонуса должно быть неотрицательным числом",
			});
		} else if (count === undefined || isNaN(count)) count = 1;

		// Создаем новый бонус
		const newBonus = await Bonus.create({
			id_partner: account.partner.id,
			naim: naim.trim(),
			count,
		});

		res.status(201).json({
			message: "Бонус успешно добавлен",
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Внутренняя ошибка сервера" });
	}
});

app.post("/change_bonus", isPartner, async (req, res) => {
	try {
		// Получаем ID авторизированного пользователя
		const userId = req.session.user.id;

		// Проверяем, что пользователь является партнером (role_id = 2)
		const account = await Account.findOne({
			where: {
				id: userId,
				role_id: 2,
			},
			include: [
				{
					model: Partner,
					as: "partner",
				},
			],
		});

		// Проверяем, существует ли аккаунт и связанный партнер
		if (!account || !account.partner) {
			return res
				.status(403)
				.json({ error: "Пользователь не является партнером" });
		}

		// Получаем данные из тела запроса
		const { id, naim, count } = req.body;

		// Валидация ID бонуса
		if (!id || isNaN(id) || id <= 0) {
			return res.status(400).json({
				error: "ID бонуса обязателен и должен быть положительным числом",
			});
		}

		// Находим бонус и проверяем, принадлежит ли он партнеру
		const bonus = await Bonus.findOne({
			where: {
				id,
				id_partner: account.partner.id,
			},
		});

		if (!bonus) {
			return res.status(404).json({
				error: "Бонус не найден или не принадлежит этому партнеру",
			});
		}

		// Валидация входных данных
		if (
			naim !== undefined &&
			(typeof naim !== "string" || naim.trim() === "")
		) {
			return res.status(400).json({
				error: "Название бонуса должно быть непустой строкой",
			});
		}
		if (count < 0) {
			return res.status(400).json({
				error: "Значение бонуса должно быть неотрицательным числом",
			});
		} else if (count !== undefined && isNaN(count)) count = 1;

		// Формируем объект с обновляемыми полями
		const updates = {};
		if (naim !== undefined) updates.naim = naim.trim();
		if (count !== undefined) updates.count = count;

		// Обновляем бонус
		await bonus.update(updates);

		res.json({
			message: "Бонус успешно обновлен",
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Внутренняя ошибка сервера" });
	}
});

app.get("/all_volonters", isPartner, async (req, res) => {
	try {
		// Получаем всех волонтеров
		const volonters = await Volonter.findAll({
			include: [
				{
					model: Account,
					as: "account",
				},
			],
		});

		// Формируем ответ
		res.json(volonters);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Внутренняя ошибка сервера" });
	}
});

app.get("/all_partners", isAdmin, async (req, res) => {
	try {
		// Получаем всех партнеров
		const partners = await Partner.findAll({
			include: [
				{
					model: Account,
					as: "account",
					attributes: ["login"], // Получаем только логин аккаунта
				},
			],
			attributes: ["id", "naim"], // Возвращаем только id и naim
		});

		// Формируем ответ
		const result = partners.map((partner) => ({
			id: partner.id,
			name: partner.naim,
			accountLogin: partner.account?.login || null, // Логин аккаунта партнера
		}));

		res.status(200).json({
			message: "Partners retrieved successfully",
			data: result,
			total: partners.length,
		});
	} catch (error) {
		console.error("Error fetching partners:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.get("/user_info", async (req, res) => {
	try {
		// Получаем токен из заголовков
		const token = req.headers.token;

		if (!token) {
			return res.status(401).json({ error: "Token is required" });
		}

		// Ищем аккаунт пользователя по токену
		const account = await Account.findOne({
			where: { token },
			include: [
				{ model: Role, as: "role" },
				{
					model: Volonter,
					as: "volonter",
					include: [
						{
							model: NachBonus,
							as: "nachBonuses",
							include: [
								{
									model: Bonus,
									as: "bonus",
									include: [
										{ model: Partner, as: "partner" },
										{ model: Category, as: "category" },
									],
								},
							],
						},
					],
				},
				{ model: Partner, as: "partner" },
			],
		});

		if (!account) {
			return res.status(404).json({ error: "User account not found" });
		}

		// Формируем ответ в зависимости от роли
		const roleName = account.role.naim;
		let userInfo;

		switch (roleName) {
			case "Администратор":
				userInfo = {
					id: account.id,
					login: account.login,
					role: roleName,
				};
				break;

			case "Предприятие-партнёр":
				if (!account.partner) {
					return res
						.status(404)
						.json({ error: "Partner data not found" });
				}
				userInfo = {
					id: account.id,
					login: account.login,
					role: roleName,
					partner: {
						id: account.partner.id,
						name: account.partner.naim,
					},
				};
				break;

			case "Волонтёр":
				if (!account.volonter) {
					return res
						.status(404)
						.json({ error: "Volunteer data not found" });
				}
				userInfo = {
					id: account.id,
					login: account.login,
					role: roleName,
					volunteer: {
						id: account.volonter.id,
						fio: account.volonter.fio,
						inn: account.volonter.inn,
						phone: account.volonter.tel,
						birthDate: account.volonter.DOB,
						bonuses:
							account.volonter.nachBonuses?.map((nachBonus) => ({
								id: nachBonus.id,
								date: nachBonus.date_nach,
								bonus: nachBonus.bonus
									? {
											id: nachBonus.bonus.id,
											name: nachBonus.bonus.naim,
											count: nachBonus.bonus.count,
											partner: nachBonus.bonus.partner
												? {
														id: nachBonus.bonus
															.partner.id,
														name: nachBonus.bonus
															.partner.naim,
												  }
												: null,
											category: nachBonus.bonus.category
												? {
														id: nachBonus.bonus
															.category.id,
														name: nachBonus.bonus
															.category.naim,
												  }
												: null,
									  }
									: null,
							})) || [],
					},
				};
				break;

			default:
				return res.status(400).json({ error: "Unknown user role" });
		}

		res.status(200).json({
			message: "User info retrieved successfully",
			data: userInfo,
		});
	} catch (error) {
		console.error("Error fetching user info:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});
app.post("/register_volonter", async (req, res) => {
	try {
		const { login, password, fio, inn, tel, dob } = req.body;

		if (!login || !password || !fio || !tel) {
			return res.status(400).json({
				error: "Обязательные поля (login, password, fio, tel) должны быть заполнены",
			});
		}

		// Проверка уникальности логина
		const existingAccount = await Account.findOne({ where: { login } });
		if (existingAccount) {
			return res.status(409).json({
				error: "Логин уже занят",
			});
		}
		console.log("token");
		const token = crypto.randomBytes(32).toString("hex");
		console.log(token);

		const result = await sequelize.transaction(async (t) => {
			// Создаём запись в таблице account
			const newAccount = await Account.create(
				{
					login: login,
					password: password,
					token: token,
					role_id: 3, // id роли волонтёра
				},
				{ transaction: t }
			);

			// Создаём запись в таблице volonter, связывая её с account через id_acc
			const newVolonter = await Volonter.create(
				{
					fio: fio,
					inn: inn || null,
					tel: tel,
					DOB: dob || null,
					id_acc: newAccount.id,
				},
				{ transaction: t }
			);

			return { account: newAccount, volonter: newVolonter, token: token };
		});

		res.status(201).json({
			message: "Регистрация успешна",
			data: result,
		});
	} catch (error) {
		console.error("Ошибка при регистрации волонтёра:", error.message);
		res.status(500).json({
			error: "Ошибка сервера при регистрации волонтёра",
			details: error.message,
		});
	}
});

app.post("/register_partner", async (req, res) => {
	try {
		const { login, password, naim } = req.body;

		if (!login || !password || !naim) {
			return res.status(400).json({
				error: "Обязательные поля (login, password, naim) должны быть заполнены",
			});
		}

		// Проверка уникальности логина
		const existingAccount = await Account.findOne({ where: { login } });
		if (existingAccount) {
			return res.status(409).json({
				error: "Логин уже занят",
			});
		}

		const token = crypto.randomBytes(32).toString("hex");

		const result = await sequelize.transaction(async (t) => {
			// Создаём запись в таблице account
			const newAccount = await Account.create(
				{
					login: login,
					password: password,
					token: token,
					role_id: 2, // id роли предприятия-партнёра
				},
				{ transaction: t }
			);

			// Создаём запись в таблице partner, связывая её с account через id_acc
			const newPartner = await Partner.create(
				{
					naim: naim,
					id_acc: newAccount.id,
				},
				{ transaction: t }
			);

			return { account: newAccount, partner: newPartner, token: token };
		});

		res.status(201).json({
			message: "Регистрация успешна",
			data: result,
		});
	} catch (error) {
		console.error("Ошибка при регистрации партнёра:", error.message);
		res.status(500).json({
			error: "Ошибка сервера при регистрации партнёра",
			details: error.message,
		});
	}
});

app.post("/change_password", async (req, res) => {
	try {
		// Проверка авторизации
		if (!req.session.user || !req.session.user.login) {
			return res
				.status(401)
				.json({ error: "Пользователь не авторизован" });
		}

		const { oldPassword, newPassword } = req.body;

		// Валидация входных данных
		if (!oldPassword || !newPassword) {
			return res.status(400).json({
				error: "Необходимо указать старый и новый пароли",
			});
		}

		// Находим аккаунт пользователя
		const account = await Account.findOne({
			where: { login: req.session.user.login },
		});

		if (!account) {
			return res.status(404).json({ error: "Аккаунт не найден" });
		}

		// Проверка старого пароля (прямое сравнение)
		if (oldPassword !== account.password) {
			return res.status(401).json({ error: "Неверный старый пароль" });
		}

		// Обновление пароля в базе данных
		await account.update({ password: newPassword });

		res.status(200).json({
			message: "Пароль успешно изменен",
		});
	} catch (error) {
		console.error("Ошибка при смене пароля:", error.message);
		res.status(500).json({
			error: "Ошибка сервера при смене пароля",
			details: error.message,
		});
	}
});

app.post("/logout", logoutUser);

app.post("/login", async (req, res) => {
	try {
		const { login, password } = req.body; // Данные клиента
		const authResult = await authenticateUser(login, password); // Проверка данных в БД

		if (!authResult.success) {
			// Если авторизация неудачная, то возвращаем сообщение об ошибке
			return res.status(401).json({ message: authResult.message });
		}

		req.session.user = authResult.user; // Сохраняем данные пользователя в сессию
		res.json({
			// Отправяем данные клиенту
			message: "Авторизация успешна",
			user: authResult.user,
		});
	} catch (error) {
		console.error("Ошибка при обработке запроса /login", error);
		res.status(500).json({ message: "Ошибка сервера" });
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
