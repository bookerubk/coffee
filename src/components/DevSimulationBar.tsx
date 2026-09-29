import React, { useState, useEffect } from 'react';
import { StorageManager } from '../services/storage';
import {
  Wrench,
  AlertTriangle,
  Clock,
  RotateCcw,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const DevSimulationBar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [simError, setSimError] = useState(StorageManager.getSimulateError());
  const [simTimeout, setSimTimeout] = useState(StorageManager.getSimulateTimeout());
  const [forceDeadline, setForceDeadline] = useState(StorageManager.getForceDeadlinePassed());

  const handleToggleError = () => {
    const next = !simError;
    setSimError(next);
    StorageManager.setSimulateError(next);
  };

  const handleToggleTimeout = () => {
    const next = !simTimeout;
    setSimTimeout(next);
    StorageManager.setSimulateTimeout(next);
  };

  const handleToggleDeadline = () => {
    const next = !forceDeadline;
    setForceDeadline(next);
    StorageManager.setForceDeadlinePassed(next);
  };

  const handleResetData = () => {
    if (confirm('Сбросить базу данных к начальным демонстрационным данным?')) {
      StorageManager.resetAll();
    }
  };

  return (
    <div className="bg-stone-900 text-stone-200 border-b border-stone-800 text-xs">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-stone-200">Панель тестирования сценариев ТЗ</span>
          <span className="hidden sm:inline text-stone-400 text-[11px]">
            (проверка раздела 4.2 «Логика сохранения и отправки» и дедлайнов)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
          >
            <span>{isOpen ? 'Скрыть параметры' : 'Настроить симуляции'}</span>
            {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-stone-800 px-4 py-3 bg-stone-950/70">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Simulate network failure */}
              <label className="flex items-center gap-2 p-1.5 px-2.5 sm:px-3 bg-stone-900 border border-stone-700 rounded-lg cursor-pointer hover:border-stone-600 transition-colors text-xs max-w-full">
                <input
                  type="checkbox"
                  checked={simError}
                  onChange={handleToggleError}
                  className="accent-rose-500 rounded shrink-0"
                />
                <span className="text-stone-300">
                  Сбой сети <span className="text-rose-400 font-bold">(Ошибка 503)</span>
                </span>
              </label>

              {/* Simulate 12s timeout */}
              <label className="flex items-center gap-2 p-1.5 px-2.5 sm:px-3 bg-stone-900 border border-stone-700 rounded-lg cursor-pointer hover:border-stone-600 transition-colors text-xs max-w-full">
                <input
                  type="checkbox"
                  checked={simTimeout}
                  onChange={handleToggleTimeout}
                  className="accent-amber-500 rounded shrink-0"
                />
                <span className="text-stone-300">
                  Таймаут <span className="text-amber-400 font-bold">(12 сек)</span>
                </span>
              </label>

              {/* Force deadline passed */}
              <label className="flex items-center gap-2 p-1.5 px-2.5 sm:px-3 bg-stone-900 border border-stone-700 rounded-lg cursor-pointer hover:border-stone-600 transition-colors text-xs max-w-full">
                <input
                  type="checkbox"
                  checked={forceDeadline}
                  onChange={handleToggleDeadline}
                  className="accent-blue-500 rounded shrink-0"
                />
                <span className="text-stone-300">
                  Дедлайн слота <span className="text-blue-400 font-bold">(Блокировка формы)</span>
                </span>
              </label>
            </div>

            <button
              onClick={handleResetData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-stone-400" />
              <span>Сбросить демо-данные</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
