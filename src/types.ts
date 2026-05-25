export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ToolLampState {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  animKey: number;   // Incremented on each activation to remount and replay animation
}
