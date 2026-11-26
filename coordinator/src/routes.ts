import { Router, Request, Response } from 'express';
import { PipelineCoordinator } from './coordinatorService';

const router = Router();

router.post('/execute/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const engine = new PipelineCoordinator(sessionId as string);
        
        const executionReport = await engine.execute();
        
        const hasFailures = executionReport.some(node => 
            node.status === 'failed' || node.status === 'error'
        );

        if (hasFailures) {
            // Return a 422 (Unprocessable Entity) to break the pipeline execution and indicate that there were failures.
            return res.status(422).json({ 
                message: "Pipeline execution failed. Deployment halted.", 
                sessionId,
                report: executionReport 
            });
        }

        return res.status(200).json({ 
            message: "Pipeline execution completed successfully.", 
            sessionId,
            report: executionReport
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;