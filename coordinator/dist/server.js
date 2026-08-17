"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3124;
app.use(express_1.default.json());
app.use('/coordinator', routes_1.default);
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'coordinator-service' });
});
app.listen(PORT, () => {
    console.log(`Coordinator Service is running on http://localhost:${PORT}`);
});
