import { Router, Request, Response } from 'express';
import { PipelineCoordinator } from './coordinatorService';

const router = Router();

router.post('/execute/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const engine = new PipelineCoordinator(sessionId as string);
        
        engine.execute().catch(e => console.error(`[Background Task] Session ${sessionId} failed:`, e));

        res.status(202).json({ 
            message: "Pipeline execution started successfully in the background.", 
            sessionId 
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;