require("./bootstrap");
import { EOL } from "os";
import * as shelljs from "shelljs";
shelljs.config.silent = true;
shelljs.config.fatal = true;
import { installUncaughtExceptionListener } from "./common/errors";
installUncaughtExceptionListener(process.exit.bind(process, ErrorCodes.UNCAUGHT));

import { settlePromises } from "./common/helpers";

/* tslint:disable:no-floating-promises */
(async () => {
	const config: Config.IConfig = $injector.resolve("$config");
	const err: IErrors = $injector.resolve("$errors");
	err.printCallStack = config.DEBUG;

	const logger: ILogger = $injector.resolve("logger");

	const extensibilityService: IExtensibilityService = $injector.resolve("extensibilityService");
	try {
		await settlePromises<IExtensionData>(extensibilityService.loadExtensions());
	} catch (err) {
		logger.trace("Unable to load extensions. Error is: ", err);
	}

	const $sysInfo = $injector.resolve<ISysInfo>("sysInfo");
	const macOSWarning = await $sysInfo.getMacOSWarningMessage();
	if (macOSWarning) {
		const message = `${EOL}${macOSWarning.message}${EOL}`;
		if (macOSWarning.severity === SystemWarningsSeverity.high) {
			logger.printOnStderr(message.red.bold);
		} else {
			logger.warn(message);
		}
	}

	const commandDispatcher: ICommandDispatcher = $injector.resolve("commandDispatcher");

	const messages: IMessagesService = $injector.resolve("$messagesService");
	messages.pathsToMessageJsonFiles = [/* Place client-specific json message file paths here */];

	if (process.argv[2] === "completion") {
		await commandDispatcher.completeCommand();
	} else {
		await commandDispatcher.dispatchCommand();
	}

	$injector.dispose();
})();
/* tslint:enable:no-floating-promises */
