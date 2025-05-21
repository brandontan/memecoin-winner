import { Logger } from 'winston';

export interface Stream {
    write: (message: string) => void;
}

export const logger: Logger;
export const stream: Stream; 