import { cache } from "../common/decorators";
import { HmrConstants } from "../common/constants";

export class HmrStatusService implements IHmrStatusService {
	public static HMR_STATUS_LOG_REGEX = /([a-z A-Z]*) hmr hash ([a-z0-9]*)\./;
	public static STARTED_MESSAGE = "Checking for updates to the bundle with";
	public static SUCCESS_MESSAGE = "Successfully applied update with";
	public static FAILED_MESSAGE = "Cannot apply update with";
	private hashOperationStatuses: IDictionary<any> = {};
	private intervals: IDictionary<any> = {};

	constructor(private $logParserService: ILogParserService,
		private $processService: IProcessService,
		private $logger: ILogger) {
			this.$processService.attachToProcessExitSignals(this, this.dispose);
		}

	public getHmrStatus(deviceId: string, operationHash: string): Promise<number> {
		return new Promise((resolve, reject) => {
			const key = `${deviceId}${operationHash}`;
			let retryCount = 40;

			this.intervals[key] = setInterval(() => {
				const status = this.getStatusByKey(key);
				if (status || retryCount === 0) {
					clearInterval(this.intervals[key]);
					this.intervals[key] = null;
					resolve(status);
				} else {
					retryCount--;
				}
			}, 250);
		});
	}

	@cache()
	public attachToHmrStatusEvent(): void {
		this.$logParserService.addParseRule({
			regex: HmrStatusService.HMR_STATUS_LOG_REGEX,
			handler: this.handleHmrStatusFound.bind(this),
			name: "hmrStatus"
		});
	}

	private handleHmrStatusFound(matches: RegExpMatchArray, deviceId: string): void {
		const message = matches[1].trim();
		const hash = matches[2];
		let status;

		switch (message) {
			case HmrStatusService.SUCCESS_MESSAGE: {
				status = HmrConstants.HMR_SUCCESS_STATUS;
				break;
			}
			case HmrStatusService.FAILED_MESSAGE: {
				status = HmrConstants.HMR_ERROR_STATUS;
				break;
			}
			default: {
				status = null;
				break;
			}
		}

		this.$logger.trace("Found hmr status.", { status, hash });

		if (status) {
			this.setData(status, hash, deviceId);
		}
	}

	private getStatusByKey(key: string): number {
		if (this.hashOperationStatuses[key]) {
			return this.hashOperationStatuses[key].status;
		}

		return null;
	}

	private setData(status: Number, operationHash: string, deviceId: string): void {
		const key = `${deviceId}${operationHash}`;

		if (!this.hashOperationStatuses[key]) {
			this.hashOperationStatuses[key] = <any>{};
		}

		this.hashOperationStatuses[key].status = status;
	}

	private dispose() {
		_.forEach(this.intervals, (value, key) => {
			clearInterval(value);
			this.intervals[key] = null;
		});
	}
}

$injector.register("hmrStatusService", HmrStatusService);
