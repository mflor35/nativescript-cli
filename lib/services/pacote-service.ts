import * as pacote from "pacote";
import * as tar from "tar";
import * as path from "path";

export class PacoteService implements IPacoteService {
	constructor(private $fs: IFileSystem,
		private $packageManager: INodePackageManager,
		private $proxyService: IProxyService,
		private $logger: ILogger) { }

	public async manifest(packageName: string, options?: IPacoteManifestOptions): Promise<any> {
		this.$logger.trace(`Calling pacoteService.manifest for packageName: '${packageName}' and options: ${options}`);
		const manifestOptions: IPacoteBaseOptions = await this.getPacoteBaseOptions();
		if (options) {
			_.extend(manifestOptions, options);
		}

		packageName = this.getRealPackageName(packageName);
		this.$logger.trace(`Calling pacote.manifest for packageName: ${packageName} and options: ${JSON.stringify(manifestOptions, null, 2)}`);
		return pacote.manifest(packageName, manifestOptions);
	}

	public async extractPackage(packageName: string, destinationDirectory: string, options?: IPacoteExtractOptions): Promise<void> {
		// strip: Remove the specified number of leading path elements. Pathnames with fewer elements will be silently skipped. More info: https://github.com/npm/node-tar/blob/e89c4d37519b1c20133a9f49d5f6b85fa34c203b/README.md
		// C: Create an archive
		this.$logger.trace(`Calling pacoteService.extractPackage for packageName: '${packageName}', destinationDir: '${destinationDirectory}' and options: ${options}`);
		const extractOptions = { strip: 1, C: destinationDirectory };
		if (options) {
			_.extend(extractOptions, options);
		}

		packageName = this.getRealPackageName(packageName);
		const pacoteOptions = await this.getPacoteBaseOptions();

		return new Promise<void>((resolve, reject) => {
			this.$logger.trace(`Calling pacoteService.extractPackage for packageName: '${packageName}', destinationDir: '${destinationDirectory}' and options: ${options}`);

			const source = pacote.tarball.stream(packageName, pacoteOptions);
			source.on("error", (err: Error) => {
				this.$logger.trace(`Error in source while trying to extract stream from ${packageName}. Error is ${err}`);
				reject(err);
			});

			this.$logger.trace(`Creating extract tar stream with options: ${JSON.stringify(extractOptions, null, 2)}`);
			const destination = tar.x(extractOptions);
			source.pipe(destination);

			destination.on("error", (err: Error) => {
				this.$logger.trace(`Error in destination while trying to extract stream from ${packageName}. Error is ${err}`);
				reject(err);
			});

			destination.on("finish", () => {
				this.$logger.trace(`Successfully extracted '${packageName}' to ${destinationDirectory}`);
				resolve();
			});
		});
	}

	private async getPacoteBaseOptions(): Promise<IPacoteBaseOptions> {
		// In case `tns create myapp --template https://github.com/NativeScript/template-hello-world.git` command is executed, pacote module throws an error if cache option is not provided.
		const cache = await this.$packageManager.getCachePath();
		const pacoteOptions = { cache };
		const proxySettings = await this.$proxyService.getCache();
		if (proxySettings) {
			_.extend(pacoteOptions, proxySettings);
		}

		return pacoteOptions;
	}

	private getRealPackageName(packageName: string): string {
		if (this.$fs.exists(packageName)) {
			this.$logger.trace(`Will resolve the full path to package ${packageName}.`);
			packageName = path.resolve(packageName);
		}

		return packageName;
	}
}
$injector.register("pacoteService", PacoteService);
