import mongoose from 'mongoose';

const routeAnalysisSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    recommendedProvider: { type: String, enum: ['local', 'tomtom'], required: true },
    confidence: { type: Number, required: true },
    explanation: { type: String, required: true },
    routes: {
        local: {
            metrics: {
                totalDistance: String,
                totalTime: String,
                totalCost: String
            },
            segments: [{
                distance: Number,
                trafficTime: Number
            }]
        },
        tomtom: {
            metrics: {
                totalDistance: String,
                totalTime: String,
                totalCost: String
            },
            segments: [{
                distance: Number,
                trafficTime: Number
            }]
        }
    },
    metadata: {
        timeOfDay: { type: String },
        dayOfWeek: { type: String },
        weather: { type: String },
        trafficLevel: { type: String }
    }
});

export const RouteAnalysis = mongoose.models.RouteAnalysis || mongoose.model('RouteAnalysis', routeAnalysisSchema); 