import { Document } from 'mongoose';

export interface ITransaction extends Document {
  from: string;
  to: string;
  amount: number;
  tokenAddress: string;
  timestamp: Date;
  // Add other transaction properties as needed
}

const Transaction: {
  find(criteria?: any): Promise<ITransaction[]>;
  findOne(criteria: any): Promise<ITransaction | null>;
  // Add other model methods as needed
};

export default Transaction;
