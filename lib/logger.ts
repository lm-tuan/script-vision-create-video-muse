export interface LogEntry {
    time: string;
    text: string;
}

type LogListener = (logs: LogEntry[]) => void;

class LogService {
    private logs: LogEntry[] = [];
    private listeners: Set<LogListener> = new Set();

    addLog(text: string) {
        const newLog: LogEntry = {
            time: new Date().toLocaleTimeString(),
            text
        };
        this.logs = [...this.logs.slice(-199), newLog];
        this.listeners.forEach(listener => {
            try {
                listener(this.logs);
            } catch (e) {
                console.error("Log subscription error:", e);
            }
        });
    }

    clearLogs() {
        this.logs = [];
        this.listeners.forEach(listener => {
            try {
                listener(this.logs);
            } catch (e) {
                console.error("Log subscription error:", e);
            }
        });
    }

    getLogs(): LogEntry[] {
        return this.logs;
    }

    subscribe(listener: LogListener): () => void {
        this.listeners.add(listener);
        // Initial sync
        listener(this.logs);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

export const logService = new LogService();
