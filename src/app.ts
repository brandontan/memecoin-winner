import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
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
    // Enable CORS
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
