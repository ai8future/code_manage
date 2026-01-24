import { promises as fs } from 'fs';
import path from 'path';
import { CodeManageConfig, DEFAULT_CONFIG, ProjectMetadata } from './types';
import { getCodeBasePath } from './scanner';

const CONFIG_FILENAME = '.code-manage.json';

function getConfigPath(): string {
  return path.join(getCodeBasePath(), CONFIG_FILENAME);
}

export async function readConfig(): Promise<CodeManageConfig> {
  const configPath = getConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      settings: {
        ...DEFAULT_CONFIG.settings,
        ...parsed.settings,
      },
    };
  } catch {
    // Config doesn't exist or is invalid, return defaults
    return DEFAULT_CONFIG;
  }
}

export async function writeConfig(config: CodeManageConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function getProjectMetadata(slug: string): Promise<ProjectMetadata | undefined> {
  const config = await readConfig();
  return config.projects[slug];
}

export async function setProjectMetadata(
  slug: string,
  metadata: Partial<ProjectMetadata>
): Promise<void> {
  const config = await readConfig();
  config.projects[slug] = {
    ...config.projects[slug],
    ...metadata,
  };
  await writeConfig(config);
}

export async function updateSettings(
  settings: Partial<CodeManageConfig['settings']>
): Promise<void> {
  const config = await readConfig();
  config.settings = {
    ...config.settings,
    ...settings,
  };
  await writeConfig(config);
}
