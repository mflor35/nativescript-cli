export class PackageManager implements INodePackageManager {
	private packageManager: INodePackageManager;

	constructor(
		private $npm: INodePackageManager,
		private $options: IOptions,
		private $yarn: INodePackageManager
	) {
		this.packageManager = this._determinePackageManager();
	}

	public install(packageName: string, pathToSave: string, config: INodePackageManagerInstallOptions): Promise<INpmInstallResultInfo> {
		return this.packageManager.install(packageName, pathToSave, config);
	}
	uninstall(packageName: string, config?: IDictionary<string | boolean>, path?: string): Promise<string> {
		return this.packageManager.uninstall(packageName, config, path);
	}
	view(packageName: string, config: Object): Promise<any> {
		return this.packageManager.view(packageName, config);
	}
	search(filter: string[], config: IDictionary<string | boolean>): Promise<string> {
		return this.packageManager.search(filter, config);
	}
	searchNpms(keyword: string): Promise<INpmsResult> {
		return this.packageManager.searchNpms(keyword);
	}
	getRegistryPackageData(packageName: string): Promise<any> {
		return this.packageManager.getRegistryPackageData(packageName);
	}
	getCachePath(): Promise<string> {
		return this.packageManager.getCachePath();
	}

	private _determinePackageManager(): INodePackageManager {
		return this.$options.yarn ? this.$yarn : this.$npm;
	}
}

$injector.register('packageManager', PackageManager);
