import { Settings } from 'lucide-react';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-8 h-8 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
      </div>

      <SettingsPanel />
    </div>
  );
}
