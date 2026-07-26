export interface AgentAdapter {
  accept(): Promise<void>;
  allowSimilarCommands(): Promise<void>;
  clearInput(): Promise<void>;
  decline(): Promise<void>;
  focus(): Promise<void>;
  interrupt(): Promise<void>;
  openModelPower(): Promise<boolean>;
  closeModelPower(): Promise<void>;
  adjustModelPower(direction: -1 | 1): Promise<void>;
  setModelPowerSpeed(mode: "standard" | "fast"): Promise<void>;
  newThread(): Promise<void>;
  cyclePermissionMode(): Promise<void>;
  toggleLastTask(): Promise<void>;
  switchSession(direction: -1 | 1): Promise<void>;
}
