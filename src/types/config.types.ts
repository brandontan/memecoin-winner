import { ConnectOptions } from 'mongoose';

export interface MongoConfig {
    uri: string;
    maxRetries: number;
    retryInterval: number;
    options: ConnectOptions;
}

export interface DatabaseConfig {
    mongodb: MongoConfig;
}

export interface ServerConfig {
    port: number;
    nodeEnv: string;
}

export interface SolanaConfig {
    rpcEndpoint: string;
    wsEndpoint: string;
}

export interface PumpFunConfig {
    graduationThreshold: number;
}

export interface LaunchpadsConfig {
    pumpFun: PumpFunConfig;
}

export interface Config {
    server: ServerConfig;
    database: DatabaseConfig;
    solana: SolanaConfig;
    launchpads: LaunchpadsConfig;
} 