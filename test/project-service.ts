import * as yok from "../lib/common/yok";
import * as stubs from "./stubs";
import * as constants from "./../lib/constants";
import { ChildProcess } from "../lib/common/child-process";
import * as ProjectServiceLib from "../lib/services/project-service";
import { ProjectNameService } from "../lib/services/project-name-service";
import * as ProjectDataServiceLib from "../lib/services/project-data-service";
import * as ProjectHelperLib from "../lib/common/project-helper";
import { StaticConfig } from "../lib/config";
import * as NpmLib from "../lib/node-package-manager";
import * as YarnLib from "../lib/yarn-package-manager";
import * as PackageManagerLib from "../lib/package-manager";
import { NpmInstallationManager } from "../lib/npm-installation-manager";
import { FileSystem } from "../lib/common/file-system";
import * as path from "path";
import temp = require("temp");
import helpers = require("../lib/common/helpers");
import { assert } from "chai";
import { Options } from "../lib/options";
import { HostInfo } from "../lib/common/host-info";
import { ProjectTemplatesService } from "../lib/services/project-templates-service";
import { SettingsService } from "../lib/common/test/unit-tests/stubs";
import { DevicePlatformsConstants } from "../lib/common/mobile/device-platforms-constants";
import { PacoteService } from "../lib/services/pacote-service";

const mockProjectNameValidator = {
	validate: () => true
};

const dummyString: string = "dummyString";
let hasPromptedForString = false;
const originalIsInteractive = helpers.isInteractive;

temp.track();

async function prepareTestingPath(testInjector: IInjector, packageToInstall: string, packageName: string, options?: INpmInstallOptions): Promise<string> {
	options = options || { dependencyType: "save" };
	const fs = testInjector.resolve<IFileSystem>("fs");

	const npmInstallationManager = testInjector.resolve<INpmInstallationManager>("npmInstallationManager");
	const defaultTemplateDir = temp.mkdirSync("project-service");
	fs.writeJson(path.join(defaultTemplateDir, constants.PACKAGE_JSON_FILE_NAME), {
		"name": "defaultTemplate",
		"version": "1.0.0",
		"description": "dummy",
		"license": "MIT",
		"readme": "dummy",
		"repository": "dummy"
	});

	await npmInstallationManager.install(packageToInstall, defaultTemplateDir, options);
	const defaultTemplatePath = path.join(defaultTemplateDir, constants.NODE_MODULES_FOLDER_NAME, packageName);

	fs.deleteDirectory(path.join(defaultTemplatePath, constants.NODE_MODULES_FOLDER_NAME));

	return defaultTemplatePath;
}

class ProjectIntegrationTest {
	public testInjector: IInjector;

	constructor() {
		this.createTestInjector();
	}

	public async createProject(projectOptions: IProjectSettings): Promise<ICreateProjectData> {
		const projectService: IProjectService = this.testInjector.resolve("projectService");
		if (!projectOptions.template) {
			projectOptions.template = constants.RESERVED_TEMPLATE_NAMES["default"];
		}
		return projectService.createProject(projectOptions);
	}

	public async assertProject(tempFolder: string, projectName: string, appId: string, projectSourceDirectory: string): Promise<void> {
		const fs: IFileSystem = this.testInjector.resolve("fs");
		const projectDir = path.join(tempFolder, projectName);
		const appDirectoryPath = path.join(projectDir, "app");
		const tnsProjectFilePath = path.join(projectDir, "package.json");
		const tnsModulesPath = path.join(projectDir, constants.NODE_MODULES_FOLDER_NAME, constants.TNS_CORE_MODULES_NAME);
		const packageJsonContent = fs.readJson(tnsProjectFilePath);

		assert.isTrue(fs.exists(appDirectoryPath));
		assert.isTrue(fs.exists(tnsProjectFilePath));
		assert.isTrue(fs.exists(tnsModulesPath));

		assert.isFalse(fs.isEmptyDir(appDirectoryPath));

		const actualAppId = packageJsonContent["nativescript"].id;
		const expectedAppId = appId;
		assert.equal(actualAppId, expectedAppId);

		const tnsCoreModulesRecord = packageJsonContent["dependencies"][constants.TNS_CORE_MODULES_NAME];
		assert.isTrue(tnsCoreModulesRecord !== null);

		const sourceDir = projectSourceDirectory;

		// assert dependencies and devDependencies are copied from template to real project
		const sourcePackageJsonContent = fs.readJson(path.join(sourceDir, "package.json"));
		const missingDeps = _.difference(_.keys(sourcePackageJsonContent.dependencies), _.keys(packageJsonContent.dependencies));
		const missingDevDeps = _.difference(_.keys(sourcePackageJsonContent.devDependencies), _.keys(packageJsonContent.devDependencies));
		assert.deepEqual(missingDeps, [], `All dependencies from template must be copied to project's package.json. Missing ones are: ${missingDeps.join(", ")}.`);
		assert.deepEqual(missingDevDeps, [], `All devDependencies from template must be copied to project's package.json. Missing ones are: ${missingDevDeps.join(", ")}.`);

		// assert App_Resources are prepared correctly
		const appResourcesDir = path.join(appDirectoryPath, "App_Resources");
		const appResourcesContents = fs.readDirectory(appResourcesDir);
		assert.deepEqual(appResourcesContents, ["Android", "iOS"], "Project's app/App_Resources must contain Android and iOS directories.");
	}

	public dispose(): void {
		this.testInjector = undefined;
	}

	private createTestInjector(): void {
		this.testInjector = new yok.Yok();
		this.testInjector.register("childProcess", ChildProcess);
		this.testInjector.register("errors", stubs.ErrorsStub);
		this.testInjector.register('logger', stubs.LoggerStub);
		this.testInjector.register("projectService", ProjectServiceLib.ProjectService);
		this.testInjector.register("projectNameService", ProjectNameService);
		this.testInjector.register("projectHelper", ProjectHelperLib.ProjectHelper);
		this.testInjector.register("projectTemplatesService", ProjectTemplatesService);
		this.testInjector.register("projectNameValidator", mockProjectNameValidator);
		this.testInjector.register("projectData", stubs.ProjectDataStub);

		this.testInjector.register("fs", FileSystem);
		this.testInjector.register("projectDataService", ProjectDataServiceLib.ProjectDataService);
		this.testInjector.register("staticConfig", StaticConfig);
		this.testInjector.register("analyticsService", {
			track: async (): Promise<any> => undefined,
			trackEventActionInGoogleAnalytics: (data: IEventActionData) => Promise.resolve()
		});

		this.testInjector.register("npmInstallationManager", NpmInstallationManager);
		this.testInjector.register("userSettingsService", {
			getSettingValue: async (settingName: string): Promise<void> => undefined
		});
		this.testInjector.register("npm", NpmLib.NodePackageManager);
		this.testInjector.register("yarn", YarnLib.YarnPackageManager);
		this.testInjector.register("packageManager", PackageManagerLib.PackageManager);
		this.testInjector.register("httpClient", {});

		this.testInjector.register("options", Options);
		this.testInjector.register("hostInfo", HostInfo);
		this.testInjector.register("prompter", {
			confirm: async (message: string): Promise<boolean> => true,
			getString: async (message: string): Promise<string> => {
				hasPromptedForString = true;
				return dummyString;
			}
		});
		this.testInjector.register("npmInstallationManager", NpmInstallationManager);
		this.testInjector.register("settingsService", SettingsService);
		this.testInjector.register("devicePlatformsConstants", DevicePlatformsConstants);
		this.testInjector.register("androidResourcesMigrationService", {
			hasMigrated: (appResourcesDir: string): boolean => true
		});
		this.testInjector.register("hooksService", {
			executeAfterHooks: async (commandName: string, hookArguments?: IDictionary<any>): Promise<void> => undefined
		});
		this.testInjector.register("pacoteService", PacoteService);
		this.testInjector.register("proxyService", {
			getCache: async (): Promise<IProxySettings> => null
		});
	}
}

describe("Project Service Tests", () => {
	describe("project service integration tests", () => {
		let defaultTemplatePath: string;

		before(async () => {
			const projectIntegrationTest = new ProjectIntegrationTest();

			defaultTemplatePath = await prepareTestingPath(projectIntegrationTest.testInjector, constants.RESERVED_TEMPLATE_NAMES["default"], constants.RESERVED_TEMPLATE_NAMES["default"]);
		});

		describe("project name validation tests", () => {
			const validProjectName = "valid";
			const invalidProjectName = "1invalid";
			let projectIntegrationTest: ProjectIntegrationTest;
			let tempFolder: string;
			let prompter: IPrompter;

			beforeEach(() => {
				hasPromptedForString = false;
				helpers.isInteractive = () => true;
				projectIntegrationTest = new ProjectIntegrationTest();
				tempFolder = temp.mkdirSync("project");
				prompter = projectIntegrationTest.testInjector.resolve("prompter");
			});

			afterEach(() => {
				helpers.isInteractive = originalIsInteractive;
			});

			it("creates project when is interactive and incorrect name is specified and the --force option is set", async () => {
				const projectName = invalidProjectName;
				await projectIntegrationTest.createProject({ projectName: projectName, pathToProject: tempFolder, force: true });
				await projectIntegrationTest.assertProject(tempFolder, projectName, `org.nativescript.${projectName}`, defaultTemplatePath);
			});

			it("creates project when is interactive and incorrect name is specified and the user confirms to use the incorrect name", async () => {
				const projectName = invalidProjectName;
				prompter.confirm = (message: string): Promise<boolean> => Promise.resolve(true);

				await projectIntegrationTest.createProject({ projectName: projectName, pathToProject: tempFolder });
				await projectIntegrationTest.assertProject(tempFolder, projectName, `org.nativescript.${projectName}`, defaultTemplatePath);
			});

			it("prompts for new name when is interactive and incorrect name is specified and the user does not confirm to use the incorrect name", async () => {
				const projectName = invalidProjectName;

				prompter.confirm = (message: string): Promise<boolean> => Promise.resolve(false);

				await projectIntegrationTest.createProject({ projectName: projectName, pathToProject: tempFolder });
				assert.isTrue(hasPromptedForString);
			});

			it("creates project when is interactive and incorrect name s specified and the user does not confirm to use the incorrect name and enters incorrect name again several times and then enters correct name", async () => {
				const projectName = invalidProjectName;

				prompter.confirm = (message: string): Promise<boolean> => Promise.resolve(false);

				const incorrectInputsLimit = 5;
				let incorrectInputsCount = 0;

				prompter.getString = async (message: string): Promise<string> => {
					if (incorrectInputsCount < incorrectInputsLimit) {
						incorrectInputsCount++;
					} else {
						hasPromptedForString = true;

						return validProjectName;
					}

					return projectName;
				};

				await projectIntegrationTest.createProject({ projectName: projectName, pathToProject: tempFolder });
				assert.isTrue(hasPromptedForString);
			});

			it("does not create project when is not interactive and incorrect name is specified", async () => {
				const projectName = invalidProjectName;
				helpers.isInteractive = () => false;

				await assert.isRejected(projectIntegrationTest.createProject({ projectName: projectName, pathToProject: tempFolder, force: false }));
			});

			it("creates project when is not interactive and incorrect name is specified and the --force option is set", async () => {
				const projectName = invalidProjectName;
				helpers.isInteractive = () => false;

				await projectIntegrationTest.createProject({ projectName: projectName, pathToProject: tempFolder, force: true });

				await projectIntegrationTest.assertProject(tempFolder, projectName, `org.nativescript.${projectName}`, defaultTemplatePath);
			});
		});

	});

	describe("isValidNativeScriptProject", () => {
		const getTestInjector = (projectData?: any): IInjector => {
			const testInjector = new yok.Yok();
			testInjector.register("packageManager", {});
			testInjector.register("errors", {});
			testInjector.register("fs", {});
			testInjector.register("logger", {});
			testInjector.register("projectDataService", {
				getProjectData: (projectDir?: string): IProjectData => projectData
			});
			testInjector.register("projectData", {});
			testInjector.register("projectNameService", {});
			testInjector.register("projectTemplatesService", {});
			testInjector.register("staticConfig", {});
			testInjector.register("projectHelper", {});
			testInjector.register("npmInstallationManager", {});
			testInjector.register("settingsService", SettingsService);
			testInjector.register("hooksService", {
				executeAfterHooks: async (commandName: string, hookArguments?: IDictionary<any>): Promise<void> => undefined
			});
			testInjector.register("pacoteService", {
				manifest: () => Promise.resolve(),
				downloadAndExtract: () => Promise.resolve()
			});

			return testInjector;
		};

		it("returns true when getProjectData does not throw, projectDir and projectId are valid", () => {
			const testInjector = getTestInjector({
				projectDir: "projectDir",
				projectId: "projectId",
				projectIdentifiers: { android: "projectId", ios: "projectId"},
			});

			const projectService: IProjectService = testInjector.resolve(ProjectServiceLib.ProjectService);
			assert.isTrue(projectService.isValidNativeScriptProject("some-dir"));
		});

		it("returns correct data when multiple calls are executed", () => {
			const testInjector = getTestInjector();
			const projectDataService = testInjector.resolve<IProjectDataService>("projectDataService");
			const projectData: any = {
				projectDir: "projectDir",
				projectId: "projectId",
				projectIdentifiers: { android: "projectId", ios: "projectId"}
			};

			let returnedProjectData: any = null;
			projectDataService.getProjectData = (projectDir?: string): IProjectData => {
				projectData.projectDir = projectDir;
				returnedProjectData = projectData;
				return returnedProjectData;
			};

			const projectService: IProjectService = testInjector.resolve(ProjectServiceLib.ProjectService);
			assert.isTrue(projectService.isValidNativeScriptProject("some-dir"));
			assert.equal(returnedProjectData.projectDir, "some-dir");
			assert.isTrue(projectService.isValidNativeScriptProject("some-dir-2"));
			assert.equal(returnedProjectData.projectDir, "some-dir-2");

			projectDataService.getProjectData = (projectDir?: string): IProjectData => {
				throw new Error("Err");
			};

			assert.isFalse(projectService.isValidNativeScriptProject("some-dir-2"));
		});

		it("returns false when getProjectData throws", () => {
			const testInjector = getTestInjector(null);
			testInjector.register("projectDataService", {
				getProjectData: (): void => { throw new Error("err"); }
			});

			const projectService: IProjectService = testInjector.resolve(ProjectServiceLib.ProjectService);
			assert.isFalse(projectService.isValidNativeScriptProject("some-dir"));
		});

		it("returns false when getProjectData does not throw, but there's no projectDir set", () => {
			const testInjector = getTestInjector({
				projectId: "projectId"
			});

			const projectService: IProjectService = testInjector.resolve(ProjectServiceLib.ProjectService);
			assert.isFalse(projectService.isValidNativeScriptProject("some-dir"));
		});

		it("returns false when getProjectData does not throw, but there's no projectId set", () => {
			const testInjector = getTestInjector({
				projectDir: "projectDir"
			});

			const projectService: IProjectService = testInjector.resolve(ProjectServiceLib.ProjectService);
			assert.isFalse(projectService.isValidNativeScriptProject("some-dir"));
		});
	});
});
