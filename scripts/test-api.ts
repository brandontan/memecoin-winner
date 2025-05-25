import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// Define response types
type HealthResponse = {
  status: string;
  message: string;
  timestamp: string;
};

type Token = {
  mintAddress: string;
  creator: string;
  name: string;
  symbol: string;
  potentialScore: number;
  // Add other token properties as needed
};

type TokensResponse = {
  status: string;
  results?: number;
  data: Token[];
};

type TokenResponse = {
  status: string;
  data: Token;
};

async function testApi() {
  try {
    console.log('=== Testing API Endpoints ===\n');
    
    // Test health check
    console.log('1. Testing health check...');
    const healthResponse = await axios.get<HealthResponse>(`${API_BASE_URL}/health`);
    console.log('✅ Health check response:', healthResponse.data);
    
    // Test getting latest tokens
    console.log('\n2. Testing get latest tokens...');
    const latestResponse = await axios.get<TokensResponse>(`${API_BASE_URL}/tokens/latest`);
    console.log('✅ Latest tokens response:', {
      status: latestResponse.status,
      count: latestResponse.data.data?.length || 0,
      data: latestResponse.data.data ? '[...]' : 'No data'
    });
    
    // Test getting a specific token
    if (latestResponse.data.data?.length > 0) {
      const tokenAddress = latestResponse.data.data[0].mintAddress;
      console.log(`\n3. Testing get token by address (${tokenAddress})...`);
      const tokenResponse = await axios.get<TokenResponse>(`${API_BASE_URL}/tokens/${tokenAddress}`);
      console.log('✅ Token details response:', {
        status: tokenResponse.status,
        data: tokenResponse.data.data || 'No data'
      });
    }
    
  } catch (error: any) {
    console.error('❌ API Test Failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
    process.exit(1);
  }
}

// Run the tests
testApi().catch(console.error);
