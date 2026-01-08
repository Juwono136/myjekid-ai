import { sequelize } from "../config/database.js";
import User from "./user.js";
import Courier from "./courier.js";
import Order from "./order.js";
import ChatSession from "./chatSession.js";
import Admin from "./admin.js";
import TrainingData from "./trainingData.js";
import Notification from "./notification.js";

// User <-> Order
User.hasMany(Order, { foreignKey: "user_phone", sourceKey: "phone" });
Order.belongsTo(User, { foreignKey: "user_phone", targetKey: "phone" });

// Courier <-> Order
Courier.hasMany(Order, { foreignKey: "courier_id", sourceKey: "id" });
Order.belongsTo(Courier, { foreignKey: "courier_id", targetKey: "id" });

// User <-> ChatSession
User.hasOne(ChatSession, { foreignKey: "phone", sourceKey: "phone" });
ChatSession.belongsTo(User, { foreignKey: "phone", targetKey: "phone" });

export { sequelize, User, Courier, Order, ChatSession, Admin, TrainingData, Notification };
