export interface AgentAdapter {
  accept(): Promise<void>;
  allowSimilarCommands(): Promise<void>;
  clearInput(): Promise<void>;
  decline(): Promise<void>;
  focus(): Promise<void>;
  interrupt(): Promise<void>;
  newThread(): Promise<void>;
  cyclePermissionMode(): Promise<void>;
  toggleLastTask(): Promise<void>;
  switchSession(direction: -1 | 1): Promise<void>;
}
