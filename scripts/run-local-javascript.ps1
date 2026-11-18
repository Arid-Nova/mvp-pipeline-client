param(
    [Parameter(Mandatory = $true)][string]$SourceManifest,
    [Parameter(Mandatory = $true)][string]$Request,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$MavenRepository = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceFile = (Resolve-Path -LiteralPath $SourceManifest).Path
$requestFile = (Resolve-Path -LiteralPath $Request).Path
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputRoot) { throw 'Choose a new output directory; existing results are never overwritten.' }
foreach ($serviceName in @('backend', 'componentanalysis')) {
    $provenancePath = Join-Path $projectRoot "$serviceName/vendor/cimet-source.json"
    if (-not (Test-Path -LiteralPath $provenancePath)) { throw 'Build the pinned engine and trusted parsers first: python scripts/build_cimet.py' }
}
New-Item -ItemType Directory -Path $outputRoot | Out-Null
$savedManifest = $env:CIMET_LOCAL_SOURCES_FILE
$savedAdapter = $env:CIMET_JAVASCRIPT_ADAPTER
$env:CIMET_LOCAL_SOURCES_FILE = $sourceFile
try {
    foreach ($serviceName in @('backend', 'componentanalysis')) {
        $serviceRoot = Join-Path $projectRoot $serviceName
        Push-Location $serviceRoot
        try {
            $mavenArguments = @('-q','-DskipTests','package','dependency:build-classpath','-Dmdep.outputFile=target/runtime-classpath.txt')
            if ($MavenRepository) { $mavenArguments = @("-Dmaven.repo.local=$([IO.Path]::GetFullPath($MavenRepository))") + $mavenArguments }
            & mvn @mavenArguments *> (Join-Path $outputRoot "$serviceName-build.log")
            if ($LASTEXITCODE -ne 0) { throw "Build failed for $serviceName; see the output log." }
            $classpath = (Join-Path $serviceRoot 'target/classes') + [IO.Path]::PathSeparator + (Get-Content 'target/runtime-classpath.txt' -Raw).Trim()
            $env:CIMET_JAVASCRIPT_ADAPTER = Join-Path $serviceRoot 'vendor/javascript'
            if ($serviceName -eq 'backend') {
                $mainClass = 'edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir.LocalExtractionCli'
                $outputFile = Join-Path $outputRoot 'native-ir.json'
            } else {
                $mainClass = 'edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.LocalComponentCli'
                $outputFile = Join-Path $outputRoot 'component-result.json'
            }
            & java -Xmx768m -cp $classpath $mainClass --request $requestFile --output $outputFile *> (Join-Path $outputRoot "$serviceName-analysis.log")
            if ($LASTEXITCODE -ne 0) { throw "Analysis failed for $serviceName; see the output log." }
            Write-Output "$serviceName analysis complete: $outputFile"
        } finally { Pop-Location }
    }
    Copy-Item -LiteralPath $requestFile -Destination (Join-Path $outputRoot 'request.json')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'backend/vendor/cimet-source.json') -Destination (Join-Path $outputRoot 'cimet-source.json')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'backend/vendor/security/aridnova-security-source.json') -Destination (Join-Path $outputRoot 'aridnova-security-source.json')
} finally {
    $env:CIMET_LOCAL_SOURCES_FILE = $savedManifest
    $env:CIMET_JAVASCRIPT_ADAPTER = $savedAdapter
}
