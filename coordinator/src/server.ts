import express, { Application } from 'express';
import coordinatorRoutes from './routes';

const app: Application = express();
const PORT = process.env.PORT || 3124;

app.use(express.json());
app.use('/coordinator', coordinatorRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'coordinator-service' });
});

app.listen(PORT, () => {
    console.log(`Coordinator Service is running on http://localhost:${PORT}`);
});