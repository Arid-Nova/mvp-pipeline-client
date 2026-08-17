"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const coordinatorService_1 = require("./coordinatorService");
const router = (0, express_1.Router)();
router.post('/execute/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const engine = new coordinatorService_1.PipelineCoordinator(sessionId);
        engine.execute().catch(e => console.error(`[Background Task] Session ${sessionId} failed:`, e));
        res.status(202).json({
            message: "Pipeline execution started successfully in the background.",
            sessionId
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
