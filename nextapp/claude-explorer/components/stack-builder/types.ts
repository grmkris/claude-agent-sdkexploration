export type TechCategory =
  | "webFrontend"
  | "backend"
  | "runtime"
  | "api"
  | "database"
  | "orm"
  | "dbSetup"
  | "auth"
  | "payments"
  | "packageManager"
  | "addons";

export interface TechOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  isDefault?: boolean;
}

export interface CategoryConfig {
  key: TechCategory;
  label: string;
  multiSelect: boolean;
}

export interface StackState {
  projectName: string;
  webFrontend: string;
  runtime: string;
  backend: string;
  database: string;
  orm: string;
  dbSetup: string;
  auth: string;
  payments: string;
  packageManager: string;
  addons: string[];
  api: string;
}

export interface CompatibilityResult {
  adjustedStack: StackState | null;
  changes: string[];
}

export interface PresetStack {
  id: string;
  name: string;
  description: string;
  icon: string;
  stack: Partial<StackState>;
}
