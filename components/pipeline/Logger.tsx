import React, { useEffect, useState, useRef } from 'react';
import { logService, LogEntry } from '@/lib/logger';
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Terminal, ChevronDown, ChevronUp } from "lucide-react";

export function Logger() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Subscribe to global log entries
    useEffect(() => {
        return logService.subscribe((updatedLogs) => {
            setLogs(updatedLogs);
        });
    }, []);

    // Auto-scroll to bottom of logs on updates
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [logs, isCollapsed]);

    const handleCopy = () => {
        const text = logs.map((l) => `[${l.time}] ${l.text}`).join("\n");
        navigator.clipboard.writeText(text);
        logService.addLog("Đã sao chép toàn bộ log vào clipboard.");
    };

    const handleClear = () => {
        logService.clearLogs();
    };

    return (
        <div className="w-full bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
            {/* Header / Control Bar */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900/50 border-b border-white/5">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs tracking-wider uppercase">
                    <Terminal className="h-4.5 w-4.5 text-primary" />
                    <span>Hệ thống ghi nhận hoạt động (Terminal Logs)</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        disabled={logs.length === 0}
                        className="h-8 px-2.5 text-slate-450 hover:text-slate-200 hover:bg-white/5 text-[11px] gap-1.5"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Sao chép
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        disabled={logs.length === 0}
                        className="h-8 px-2.5 text-slate-450 hover:text-rose-450 hover:bg-white/5 text-[11px] gap-1.5"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Dọn dẹp
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="h-8 w-8 p-0 text-slate-450 hover:text-slate-200"
                    >
                        {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Log Panel Body */}
            {!isCollapsed && (
                <div
                    ref={scrollContainerRef}
                    className="h-44 overflow-y-auto px-5 py-4 log-font text-xs text-slate-450 space-y-2 leading-relaxed bg-black/40 scrollbar-thin select-text"
                >
                    {logs.length > 0 ? (
                        logs.map((log, idx) => (
                            <div key={idx} className="flex items-start gap-3 hover:bg-white/2 px-1 py-0.5 rounded transition-colors">
                                <span className="text-slate-650 shrink-0 select-none font-mono">[{log.time}]</span>
                                <span className="text-slate-300 whitespace-pre-wrap font-sans break-all">{log.text}</span>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-600 font-sans italic text-center py-10 select-none">
                            Chưa có hoạt động nào được ghi nhận. Bắt đầu quy trình để xem logs.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
