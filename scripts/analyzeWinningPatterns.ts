import { Connection } from '@solana/web3.js';
import { WinningPatternsAnalyzer } from '../src/analysis/winningPatternsAnalyzer';
import { logger } from '../src/utils/logger';
import config from '../config';

async function main() {
  try {
    logger.info('Starting winning patterns analysis...');
    
    // Initialize Solana connection
    const connection = new Connection(config.solanaRpc, 'confirmed');
    
    // Initialize analyzer
    const analyzer = new WinningPatternsAnalyzer(connection);
    
    // Run analysis
    await analyzer.analyzeWinners();
    
    logger.info('Analysis complete!');
    process.exit(0);
  } catch (error) {
    logger.error('Error in winning patterns analysis:', error);
    process.exit(1);
  }
}

// Run the analysis
main();
