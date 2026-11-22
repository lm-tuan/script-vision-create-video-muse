Add-Type -AssemblyName System.Windows.Forms

# Create a transparent topmost dummy form to act as the dialog owner, forcing the dialog to the front
$Owner = New-Object System.Windows.Forms.Form
$Owner.TopMost = $true
$Owner.Width = 1
$Owner.Height = 1
$Owner.Opacity = 0
$Owner.ShowInTaskbar = $false
$Owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$Owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen

# Show and focus the owner form
$Owner.Show()
$Owner.Activate()

$FolderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
$FolderBrowser.Description = "Chọn thư mục lưu trữ dự án ScriptVision"
$FolderBrowser.ShowNewFolderButton = $true

# Read InitialPath from the config JSON file to prevent UTF8 character corruption in command line arguments
$ConfigPath = Join-Path $PSScriptRoot "select_folder_config.json"
$InitialPath = ""

if (Test-Path $ConfigPath) {
    try {
        $Config = Get-Content -Raw -Encoding UTF8 $ConfigPath | ConvertFrom-Json
        $InitialPath = $Config.initialPath
    } catch {
        # Fallback if parsing fails
    }
}

if ($InitialPath -and (Test-Path $InitialPath -PathType Container)) {
    $FolderBrowser.SelectedPath = $InitialPath
}

# Show Dialog with the topmost Owner form
$Result = $FolderBrowser.ShowDialog($Owner)

# Close the owner form
$Owner.Close()

if ($Result -eq [System.Windows.Forms.DialogResult]::OK) {
    # Force output to UTF-8
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $FolderBrowser.SelectedPath
}
