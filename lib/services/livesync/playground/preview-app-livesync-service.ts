import * as path from "path";
import { FilePayload, Device, FilesPayload } from "nativescript-preview-sdk";
import { PreviewSdkEventNames } from "./preview-app-constants";
import { APP_FOLDER_NAME, APP_RESOURCES_FOLDER_NAME, TNS_MODULES_FOLDER_NAME } from "../../../constants";
const isTextOrBinary = require('istextorbinary');

export class PreviewAppLiveSyncService implements IPreviewAppLiveSyncService {
	private excludedFileExtensions = [".ts", ".sass", ".scss", ".less"];
	private excludedFiles = [".DS_Store"];
	private deviceInitializationPromise: IDictionary<Promise<FilesPayload>> = {};

	constructor(private $fs: IFileSystem,
		private $errors: IErrors,
		private $hooksService: IHooksService,
		private $logger: ILogger,
		private $platformService: IPlatformService,
		private $platformsData: IPlatformsData,
		private $projectDataService: IProjectDataService,
		private $previewSdkService: IPreviewSdkService,
		private $previewAppPluginsService: IPreviewAppPluginsService,
		private $projectFilesManager: IProjectFilesManager,
		private $projectFilesProvider: IProjectFilesProvider) { }

	public async initialize(data: IPreviewAppLiveSyncData): Promise<void> {
		await this.$previewSdkService.initialize(async (device: Device) => {
			if (!device) {
				this.$errors.failWithoutHelp("Sending initial preview files without a specified device is not supported.");
			}

			if (this.deviceInitializationPromise[device.id]) {
				return this.deviceInitializationPromise[device.id];
			}

			this.deviceInitializationPromise[device.id] = this.initializePreviewForDevice(data, device);
			try {
				const payloads = await this.deviceInitializationPromise[device.id];
				return payloads;
			} finally {
				this.deviceInitializationPromise[device.id] = null;
			}
		});
	}

	private async initializePreviewForDevice(data: IPreviewAppLiveSyncData, device: Device): Promise<FilesPayload> {
		const filesToSyncMap: IDictionary<string[]> = {};
		let promise = Promise.resolve<FilesPayload>(null);
		const startSyncFilesTimeout = async (platform: string) => {
			await promise
			.then(async () => {
					// We don't need to prepare when webpack emits changed files. We just need to send a message to pubnub.
					promise = this.syncFilesForPlatformSafe(data, platform, { filesToSync: filesToSyncMap[platform], skipPrepare: true });
					await promise;
				});
			filesToSyncMap[platform] = [];
		};
		await this.$hooksService.executeBeforeHooks("preview-sync", {
			hookArgs: {
				projectData: this.$projectDataService.getProjectData(data.projectDir),
				config: {
					env: data.env,
					platform: device.platform,
					appFilesUpdaterOptions: data.appFilesUpdaterOptions,
				},
				externals: this.$previewAppPluginsService.getExternalPlugins(device),
				filesToSyncMap,
				startSyncFilesTimeout: startSyncFilesTimeout.bind(this)
			}
		});
		await this.$previewAppPluginsService.comparePluginsOnDevice(data, device);
		const payloads = await this.syncFilesForPlatformSafe(data, device.platform, { isInitialSync: true });
		return payloads;
	}

	public async syncFiles(data: IPreviewAppLiveSyncData, filesToSync: string[], filesToRemove: string[]): Promise<void> {
		this.showWarningsForNativeFiles(filesToSync);

		for (const device of this.$previewSdkService.connectedDevices) {
			await this.$previewAppPluginsService.comparePluginsOnDevice(data, device);
		}

		const platforms = _(this.$previewSdkService.connectedDevices)
			.map(device => device.platform)
			.uniq()
			.value();

		for (const platform of platforms) {
			await this.syncFilesForPlatformSafe(data, platform, { filesToSync, filesToRemove });
		}
	}

	public async stopLiveSync(): Promise<void> {
		this.$previewSdkService.stop();
	}

	private async syncFilesForPlatformSafe(data: IPreviewAppLiveSyncData, platform: string, opts?: { filesToSync?: string[], filesToRemove?: string[], isInitialSync?: boolean, skipPrepare?: boolean }): Promise<FilesPayload> {
		this.$logger.info(`Start syncing changes for platform ${platform}.`);

		opts = opts || {};
		const { filesToSync, filesToRemove } = opts;
		let payloads = null;

		try {
			const { appFilesUpdaterOptions, env, projectDir } = data;
			const projectData = this.$projectDataService.getProjectData(projectDir);
			const platformData = this.$platformsData.getPlatformData(platform, projectData);

			if (!opts.skipPrepare) {
				await this.preparePlatform(platform, appFilesUpdaterOptions, env, projectData);
			}

			if (opts.isInitialSync) {
				const platformsAppFolderPath = path.join(platformData.appDestinationDirectoryPath, APP_FOLDER_NAME);
				const files = this.$projectFilesManager.getProjectFiles(platformsAppFolderPath);
				payloads = this.getFilesPayload(platformData, projectData, files);
				this.$logger.info(`Successfully synced changes for platform ${platform}.`);
			} else {
				const files = _.map(filesToSync, file => this.$projectFilesProvider.mapFilePath(file, platformData.normalizedPlatformName, projectData));
				payloads = this.getFilesPayload(platformData, projectData, files, filesToRemove);
				await this.$previewSdkService.applyChanges(payloads);
				this.$logger.info(`Successfully synced ${payloads.files.map(filePayload => filePayload.file.yellow)} for platform ${platform}.`);
			}

			return payloads;
		} catch (err) {
			this.$logger.warn(`Unable to apply changes for platform ${platform}. Error is: ${err}, ${JSON.stringify(err, null, 2)}.`);
		}
	}

	private getFilesPayload(platformData: IPlatformData, projectData: IProjectData, filesToSync?: string[], filesToRemove?: string[]): FilesPayload {
		const filesToTransfer = filesToSync
			.filter(file => file.indexOf(TNS_MODULES_FOLDER_NAME) === -1)
			.filter(file => file.indexOf(APP_RESOURCES_FOLDER_NAME) === -1)
			.filter(file => !_.includes(this.excludedFiles, path.basename(file)))
			.filter(file => !_.includes(this.excludedFileExtensions, path.extname(file)));

		this.$logger.trace(`Transferring ${filesToTransfer.join("\n")}.`);

		const payloadsToSync = filesToTransfer.map(file => this.createFilePayload(file, platformData, projectData, PreviewSdkEventNames.CHANGE_EVENT_NAME));
		const payloadsToRemove = _.map(filesToRemove, file => this.createFilePayload(file, platformData, projectData, PreviewSdkEventNames.UNLINK_EVENT_NAME));
		const payloads = payloadsToSync.concat(payloadsToRemove);

		return { files: payloads, platform: platformData.normalizedPlatformName.toLowerCase() };
	}

	private async preparePlatform(platform: string, appFilesUpdaterOptions: IAppFilesUpdaterOptions, env: Object, projectData: IProjectData): Promise<void> {
		const nativePrepare = { skipNativePrepare: true };
		const config = <IPlatformOptions>{};
		const platformTemplate = <string>null;
		const prepareInfo = {
			platform,
			appFilesUpdaterOptions,
			env,
			projectData,
			nativePrepare,
			config,
			platformTemplate,
			skipCopyTnsModules: true,
			skipCopyAppResourcesFiles: true
		};
		await this.$platformService.preparePlatform(prepareInfo);
	}

	private showWarningsForNativeFiles(files: string[]): void {
		_.filter(files, file => file.indexOf(APP_RESOURCES_FOLDER_NAME) > -1)
			.forEach(file => this.$logger.warn(`Unable to apply changes from ${APP_RESOURCES_FOLDER_NAME} folder. You need to build your application in order to make changes in ${APP_RESOURCES_FOLDER_NAME} folder.`));
	}

	private createFilePayload(file: string, platformData: IPlatformData, projectData: IProjectData, event: string): FilePayload {
		const projectFileInfo = this.$projectFilesProvider.getProjectFileInfo(file, platformData.normalizedPlatformName, null);
		const binary = isTextOrBinary.isBinarySync(file);
		let fileContents = "";
		let filePath = "";

		if (event === PreviewSdkEventNames.CHANGE_EVENT_NAME) {
			const relativePath = path.relative(path.join(platformData.appDestinationDirectoryPath, APP_FOLDER_NAME), file);
			filePath = path.join(path.dirname(relativePath), projectFileInfo.onDeviceFileName);

			if (binary) {
				const bitmap = <string>this.$fs.readFile(file);
				const base64 = Buffer.from(bitmap).toString('base64');
				fileContents = base64;
			} else {
				fileContents = this.$fs.readText(path.join(path.dirname(projectFileInfo.filePath), projectFileInfo.onDeviceFileName));
			}
		} else if (event === PreviewSdkEventNames.UNLINK_EVENT_NAME) {
			filePath = path.relative(path.join(projectData.projectDir, APP_FOLDER_NAME), file);
		}

		const filePayload = {
			event,
			file: filePath,
			binary,
			fileContents
		};

		return filePayload;
	}
}
$injector.register("previewAppLiveSyncService", PreviewAppLiveSyncService);
