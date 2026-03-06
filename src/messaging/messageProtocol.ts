export const MESSAGE_SOURCE = 'element-inspector';

export interface ElementSelectedMessage {
  type: 'element-selected';
  source: typeof MESSAGE_SOURCE;
  payload: {
    selector: string;
    filePath: string | null;
    htmlSnippet: string;
  };
}

export interface ToggleInspectionMessage {
  type: 'toggle-inspection';
  source: typeof MESSAGE_SOURCE;
  payload: {
    enabled: boolean;
  };
}

export interface InspectionStateMessage {
  type: 'inspection-state';
  source: typeof MESSAGE_SOURCE;
  payload: {
    enabled: boolean;
  };
}

export interface InstructionItem {
  instruction: string;
  selector: string;
  filePath: string | null;
  htmlSnippet: string;
}

export interface BatchInstructionsMessage {
  type: 'batch-instructions';
  source: typeof MESSAGE_SOURCE;
  payload: {
    instructions: InstructionItem[];
  };
}

export type InspectorMessage =
  | ElementSelectedMessage
  | ToggleInspectionMessage
  | InspectionStateMessage
  | BatchInstructionsMessage;

export function createElementSelectedMessage(
  selector: string,
  filePath: string | null,
  htmlSnippet: string
): ElementSelectedMessage {
  return {
    type: 'element-selected',
    source: MESSAGE_SOURCE,
    payload: { selector, filePath, htmlSnippet },
  };
}

export function createToggleInspectionMessage(enabled: boolean): ToggleInspectionMessage {
  return {
    type: 'toggle-inspection',
    source: MESSAGE_SOURCE,
    payload: { enabled },
  };
}

export function isInspectorMessage(data: unknown): data is InspectorMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.source === MESSAGE_SOURCE &&
    typeof msg.type === 'string' &&
    typeof msg.payload === 'object' &&
    msg.payload !== null
  );
}

export function isElementSelectedMessage(data: unknown): data is ElementSelectedMessage {
  return isInspectorMessage(data) && data.type === 'element-selected';
}

export function createBatchInstructionsMessage(
  instructions: InstructionItem[]
): BatchInstructionsMessage {
  return {
    type: 'batch-instructions',
    source: MESSAGE_SOURCE,
    payload: { instructions },
  };
}

export function isBatchInstructionsMessage(data: unknown): data is BatchInstructionsMessage {
  return isInspectorMessage(data) && data.type === 'batch-instructions';
}
