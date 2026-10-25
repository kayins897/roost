param([int]$VerifyPort = 0)
$ErrorActionPreference = 'Stop'
$profileLock = $null
try {
    $bundleDirectory = $PSScriptRoot
    $executable = Join-Path $bundleDirectory '栖域.exe'
    $locator = Join-Path $bundleDirectory 'qiyu-demo-profile.json'
    $profileLock = [System.IO.File]::Open((Join-Path $bundleDirectory '.qiyu-demo-launch.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    if (!(Test-Path -LiteralPath $executable -PathType Leaf)) { throw '程序文件不完整，请重新完整解压 ZIP。' }
    if (Test-Path -LiteralPath $locator) {
        $saved = Get-Content -LiteralPath $locator -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($saved.format -ne 'qiyu.demo.launcher.v1' -or ![System.IO.Path]::IsPathRooted($saved.directory)) { throw '演示入口记录损坏，已停止启动；请保留记录并重新解压到新文件夹。' }
        $profileDirectory = $saved.directory
        if (!(Test-Path -LiteralPath (Join-Path $profileDirectory 'qiyu-demo.json') -PathType Leaf) -or !(Test-Path -LiteralPath (Join-Path $profileDirectory 'library.json') -PathType Leaf)) { throw '此前的演示目录或收藏已丢失，未重新创建。请保留原入口，重新解压到新文件夹可新建演示。' }
    } else {
        $seed = Join-Path $bundleDirectory 'demo-library.json'
        if (!(Test-Path -LiteralPath $seed -PathType Leaf)) { throw '缺少随包合成演示库，请重新解压完整 ZIP。' }
        $profileDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('qiyu-demo-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $profileDirectory | Out-Null
        Copy-Item -LiteralPath $seed -Destination (Join-Path $profileDirectory 'library.json')
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText((Join-Path $profileDirectory 'qiyu-demo.json'), '{"format":"qiyu.demo.v1"}', $utf8)
        $saved = @{ format = 'qiyu.demo.launcher.v1'; directory = $profileDirectory } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($locator, $saved, $utf8)
    }
    $profileLock.Dispose(); $profileLock = $null
    # Only this launcher process is changed; no environment variables leak to normal launches.
    Remove-Item Env:QIYU_E2E -ErrorAction SilentlyContinue
    Remove-Item Env:QIYU_TEST_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $arguments = @('--demo', ('"--demo-profile=' + $profileDirectory + '"'))
    if ($VerifyPort -ne 0) {
        if ($VerifyPort -lt 1024 -or $VerifyPort -gt 65535) { throw '验收端口无效。' }
        $arguments += '--remote-debugging-address=127.0.0.1'
        $arguments += ('--remote-debugging-port=' + $VerifyPort)
    }
    Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $bundleDirectory -WindowStyle Hidden | Out-Null
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '栖域演示启动已停止', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($profileLock) { $profileLock.Dispose() }
}
