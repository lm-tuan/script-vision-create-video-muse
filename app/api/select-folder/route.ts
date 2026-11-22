import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, isAbsolute } from 'path';
import { writeFile } from 'fs/promises';

const execAsync = promisify(exec);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const currentPath = searchParams.get('currentPath') || searchParams.get('initialPath') || '';

        let resolvedPath = currentPath.trim();
        if (resolvedPath && !isAbsolute(resolvedPath)) {
            resolvedPath = join(process.cwd(), resolvedPath);
        }

        // Save path to a JSON file to prevent PowerShell argument encoding issues (e.g. Vietnamese accents)
        const configPath = join(process.cwd(), 'scripts', 'select_folder_config.json');
        await writeFile(configPath, JSON.stringify({ initialPath: resolvedPath }, null, 2), 'utf-8');

        const scriptPath = join(process.cwd(), 'scripts', 'select-folder.ps1');
        
        const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Sta -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${scriptPath}'"`;

        const { stdout } = await execAsync(cmd, { timeout: 120000, encoding: 'utf-8' });

        const selectedPath = stdout.trim();

        if (selectedPath) {
            return NextResponse.json({ success: true, path: selectedPath });
        } else {
            return NextResponse.json({ success: false, cancelled: true });
        }
    } catch (error) {
        console.error('Error opening folder dialog:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to open folder picker'
        }, { status: 500 });
    }
}
