import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import type { Request, Response, NextFunction, RequestHandler } from '../types/express';
import type { CorsOptions } from '../types/cors';
import { config } from './config/config';
import apiRoutes from './routes/apiRoutes';

class App {
  public app: Express;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Enable CORS with specific origins and headers
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      // Add production domains here
    ];

    const corsOptions: CorsOptions = {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
          const msg = `The CORS policy for this site does not allow access from the specified origin: ${origin}`;
          console.warn(msg);
          return callback(new Error(msg), false);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    };
    
    this.app.use(cors(corsOptions));
    
    // Parse JSON bodies with size limit
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Health check endpoint
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'connected',
        timestamp: Date.now(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    });
    
    // Logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
      });
      
      next();
    });
  }

  private initializeRoutes(): void {
    console.log('Initializing routes...');
    
    // API routes
    console.log('Registering API routes...');
    this.app.use('/api', apiRoutes);
    
    // Log all registered routes (delayed to ensure router is initialized)
    setTimeout(() => {
      try {
        const routes: string[] = [];
        
        // Get all registered routes
        const printRoutes = (router: any, prefix = '') => {
          router.stack.forEach((middleware: any) => {
            if (middleware.route) {
              // Routes registered directly on the app
              const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase()).join(',');
              routes.push(`${methods} ${prefix}${middleware.route.path}`);
            } else if (middleware.name === 'router' || middleware.name === 'router') {
              // Routes added with router.X
              const routerPath = middleware.regexp.source
                .replace('^', '')
                .replace('\/?', '')
                .replace('(?=\/|$)', '')
                .replace(/\\(.)/g, '$1');
              
              middleware.handle.stack.forEach((handler: any) => {
                if (handler.route) {
                  const methods = Object.keys(handler.route.methods).map(m => m.toUpperCase()).join(',');
                  routes.push(`${methods} ${prefix}${routerPath}${handler.route.path}`);
                }
              });
            }
          });
        };
        
        printRoutes(this.app._router);
        
        console.log('\n=== Registered Routes ===');
        routes.forEach(route => console.log(`- ${route}`));
        console.log('=========================\n');
      } catch (error) {
        console.warn('Could not log routes:', error);
      }
    }, 100);

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        status: 'error',
        message: 'Not Found',
        path: req.path
      });
    });
  }

  private initializeErrorHandling(): void {
    // Error handling middleware
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error('Error:', err);
      
      const statusCode = err.statusCode || 500;
      const message = err.message || 'Internal Server Error';
      
      res.status(statusCode).json({
        status: 'error',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });
  }

  public async connectToDatabase(): Promise<void> {
    try {
      if (!config.database.mongodb.uri) {
        throw new Error('MongoDB URI is not configured');
      }
      
      console.log('Connecting to MongoDB...');
      
      // Simplified connection options for local development
      const options: mongoose.ConnectOptions = {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        w: 'majority' as const
      };
      
      console.log('Connecting to MongoDB with options:', {
        uri: config.database.mongodb.uri,
        ...options
      });
      
      await mongoose.connect(config.database.mongodb.uri, options);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }
}

export default new App();
