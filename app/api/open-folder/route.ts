import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isAbsolute, join } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';

const execAsync = promisify(exec);

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { folderPath } = body;

        const path = folderPath && typeof folderPath === 'string' ? folderPath.trim() : 'outputs';
        const targetDir = isAbsolute(path) ? path : join(process.cwd(), path);

        if (!existsSync(targetDir)) {
            await mkdir(targetDir, { recursive: true });
        }

        // Use COM Shell.Application to open the folder, forcing it to the foreground
        const safePath = targetDir.replace(/'/g, "''");
        await execAsync(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).open('${safePath}')"`);
        return NextResponse.json({ success: true, openedPath: targetDir });
    } catch (error) {
        console.error("Open folder error:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Không thể mở thư mục'
        }, { status: 500 });
    }
}
