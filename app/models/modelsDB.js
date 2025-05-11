const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("./client");

// Define the Account model
const Account = sequelize.define(
	"Account",
	{
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false,
		},
		login: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		password: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		token: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
	},
	{
		tableName: "account",
		schema: "public",
		timestamps: false,
	}
);

// Define the Dish model
const Dish = sequelize.define(
	"Dish",
	{
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false,
		},
		id_acc: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		naim: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		description: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		cooking_time: {
			type: DataTypes.TIME,
			allowNull: true,
		},
		ingredients: {
			type: DataTypes.JSONB,
			allowNull: true,
		},
	},
	{
		tableName: "dish",
		schema: "public",
		timestamps: false,
	}
);

// Define the Favorites model
const Favorites = sequelize.define(
	"Favorites",
	{
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false,
		},
		id_acc: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		id_dish: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
	},
	{
		tableName: "favorites",
		schema: "public",
		timestamps: false,
	}
);

// Define relationships
Account.hasMany(Dish, {
	foreignKey: "id_acc",
	sourceKey: "id",
	as: "dishes",
});

Dish.belongsTo(Account, {
	foreignKey: "id_acc",
	targetKey: "id",
	as: "account",
});

Account.hasMany(Favorites, {
	foreignKey: "id_acc",
	sourceKey: "id",
	as: "favorites",
});

Favorites.belongsTo(Account, {
	foreignKey: "id_acc",
	targetKey: "id",
	as: "account",
});

Dish.hasMany(Favorites, {
	foreignKey: "id_dish",
	sourceKey: "id",
	as: "favorites",
});

Favorites.belongsTo(Dish, {
	foreignKey: "id_dish",
	targetKey: "id",
	as: "dish",
});

// Export the models and sequelize instance
module.exports = {
	sequelize,
	Account,
	Dish,
	Favorites,
};
