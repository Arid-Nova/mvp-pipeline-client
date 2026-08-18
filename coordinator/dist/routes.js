"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const coordinatorService_1 = require("./coordinatorService");
const router = (0, express_1.Router)();
router.post('/execute/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const engine = new coordinatorService_1.PipelineCoordinator(sessionId);
        const executionReport = await engine.execute();
        const hasFailures = executionReport.some(node => node.status === 'failed' || node.status === 'error');
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
