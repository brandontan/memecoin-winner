import { Connection } from '@solana/web3.js';

async function testSolanaConnection() {
    try {
        const connection = new Connection('https://api.mainnet-beta.solana.com');
        const slot = await connection.getSlot();
        console.log(`Connected to mainnet, slot: ${slot}`);
    } catch (error) {
        console.error('Connection failed:', error instanceof Error ? error.message : error);
    }
}

testSolanaConnection().catch(console.error);
