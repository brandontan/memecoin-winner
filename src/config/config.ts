import dotenv from 'dotenv';
import { Config } from '../types/config.types';
import { ConnectOptions } from 'mongoose';

dotenv.config();

console.log('DEBUG config.ts loaded');

const config: Config = {
    server: {
        port: parseInt(process.env.PORT || '3001', 10),
        nodeEnv: process.env.NODE_ENV || 'development',
    },
    
    database: {
        mongodb: {
            uri: process.env.MONGODB_URI || '',
            maxRetries: 5,
            retryInterval: 5000,
            options: {
                maxPoolSize: 10,
                minPoolSize: 5,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 10000,
                serverSelectionTimeoutMS: 10000,
                heartbeatFrequencyMS: 10000,
                retryWrites: true,
                retryReads: true,
                w: 'majority',
                wtimeoutMS: 2500,
                readPreference: 'primaryPreferred',
                ssl: true,
                tls: true,
                tlsAllowInvalidCertificates: false,
                tlsAllowInvalidHostnames: false,
                monitorCommands: true
            } as ConnectOptions
        }
    },

    solana: {
        rpcEndpoint: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        wsEndpoint: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com'
    },

    launchpads: {
        pumpFun: {
            graduationThreshold: parseInt(process.env.PUMP_FUN_GRADUATION_THRESHOLD || '1000000', 10)
        }
    },
    
    monitoring: {
        maxRetries: parseInt(process.env.MONITORING_MAX_RETRIES || '5', 10),
        retryDelay: parseInt(process.env.MONITORING_RETRY_DELAY || '5000', 10),
        pollingInterval: parseInt(process.env.MONITORING_POLLING_INTERVAL || '10000', 10)
    }
};

console.log('DEBUG config export:', config);

export { config }; 