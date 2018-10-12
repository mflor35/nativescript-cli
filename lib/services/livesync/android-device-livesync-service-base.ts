import { DeviceLiveSyncServiceBase } from './device-livesync-service-base';

export abstract class AndroidDeviceLiveSyncServiceBase extends DeviceLiveSyncServiceBase {
	constructor(protected $injector: IInjector,
		protected $platformsData: IPlatformsData,
		protected $filesHashService: IFilesHashService,
		protected $logger: ILogger,
		protected device: Mobile.IAndroidDevice) {
			super($platformsData, device);
	}

	public abstract async transferFilesOnDevice(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[]): Promise<void>;
	public abstract async transferDirectoryOnDevice(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string): Promise<void>;

	public async transferFiles(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string, projectData: IProjectData, liveSyncDeviceInfo: ILiveSyncDeviceInfo, options: ITransferFilesOptions): Promise<Mobile.ILocalToDevicePathData[]> {
		const deviceHashService = this.device.fileSystem.getDeviceHashService(deviceAppData.appIdentifier);
		const currentHashes = await deviceHashService.generateHashesFromLocalToDevicePaths(localToDevicePaths);
		const transferredFiles = await this.transferFilesCore(deviceAppData, localToDevicePaths, projectFilesPath, currentHashes, options);
		await this.device.fileSystem.updateHashesOnDevice(currentHashes, deviceAppData.appIdentifier);
		return transferredFiles;
	}

	private async transferFilesCore(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string, currentHashes: IStringDictionary, options: ITransferFilesOptions): Promise<Mobile.ILocalToDevicePathData[]> {
		if (options.force && options.isFullSync) {
			const hashFileDevicePath = this.device.fileSystem.getDeviceHashService(deviceAppData.appIdentifier).hashFileDevicePath;
			await this.device.fileSystem.deleteFile(hashFileDevicePath, deviceAppData.appIdentifier);
			this.$logger.trace("Before transfer directory on device ", localToDevicePaths);
			await this.transferDirectoryOnDevice(deviceAppData, localToDevicePaths, projectFilesPath);
			return localToDevicePaths;
		}

		const localToDevicePathsToTransfer = await this.getLocalToDevicePathsToTransfer(deviceAppData, localToDevicePaths, currentHashes, options);
		this.$logger.trace("Files to transfer: ", localToDevicePathsToTransfer);
		await this.transferFilesOnDevice(deviceAppData, localToDevicePathsToTransfer);
		return localToDevicePathsToTransfer;
	}

	private async getLocalToDevicePathsToTransfer(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], currentHashes: IStringDictionary, options: ITransferFilesOptions): Promise<Mobile.ILocalToDevicePathData[]> {
		if (options.force || !options.isFullSync) {
			return localToDevicePaths;
		}

		const changedLocalToDevicePaths = await this.getChangedLocalToDevicePaths(deviceAppData.appIdentifier, localToDevicePaths, currentHashes);
		return changedLocalToDevicePaths;
	}

	private async getChangedLocalToDevicePaths(appIdentifier: string, localToDevicePaths: Mobile.ILocalToDevicePathData[], currentHashes: IStringDictionary): Promise<Mobile.ILocalToDevicePathData[]> {
		const deviceHashService = this.device.fileSystem.getDeviceHashService(appIdentifier);
		const oldHashes = (await deviceHashService.getShasumsFromDevice()) || {};
		const changedHashes = deviceHashService.getChangedShasums(oldHashes, currentHashes);
		const changedFiles = _.keys(changedHashes);
		const changedLocalToDevicePaths = localToDevicePaths.filter(localToDevicePathData => changedFiles.indexOf(localToDevicePathData.getLocalPath()) >= 0);
		return changedLocalToDevicePaths;
	}
}
