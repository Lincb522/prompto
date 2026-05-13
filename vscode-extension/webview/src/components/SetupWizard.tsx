import { useState, useEffect, useCallback } from "react";
import { Check, Loader2, Download, Layers, Cpu, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/vscode-api";
import { useAppStore, type CliStatus, type McpStatus, type ModelInfo, type TargetCli } from "@/store/app-store";

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = 1 | 2 | 3;

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [clis, setClis] = useState<CliStatus[]>([]);
  const [mcpStatuses, setMcpStatuses] = useState<McpStatus[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCli, setSelectedCli] = useState<TargetCli>("claude");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const replaceConfig = useAppStore((s) => s.replaceConfig);
  const config = useAppStore((s) => s.config);

  // 初始化加载
  useEffect(() => {
    api.detectClis().then((c) => setClis(c as CliStatus[])).catch(() => {});
    api.checkMcpStatus().then((s) => setMcpStatuses(s as McpStatus[])).catch(() => {});
  }, []);

  // 加载模型列表
  useEffect(() => {
    api.listModels(selectedCli).then((m) => setModels(m as ModelInfo[])).catch(() => {});
  }, [selectedCli]);

  const hasAnyCli = clis.some((c) => c.installed);
  const hasAnyMcp = mcpStatuses.some((s) => s.installed);

  const handleInstallCli = async (cli: string) => {
    setInstalling(cli);
    setError(null);
    try {
      const result = await api.installCli(cli);
      if (result.success) {
        // 刷新 CLI 状态
        const updated = await api.detectClis();
        setClis(updated as CliStatus[]);
      } else {
        setError(result.error || "安装失败");
      }
    } catch (e: any) {
      setError(e?.message || "安装失败");
    } finally {
      setInstalling(null);
    }
  };

  const handleInstallMcp = async (ide: string) => {
    setInstalling(ide);
    setError(null);
    try {
      const result = await api.installMcp(ide);
      if (result.success) {
        const updated = await api.checkMcpStatus();
        setMcpStatuses(updated as McpStatus[]);
      } else {
        setError(result.error || "安装失败");
      }
    } catch (e: any) {
      setError(e?.message || "安装失败");
    } finally {
      setInstalling(null);
    }
  };

  const handleFinish = useCallback(async () => {
    if (config) {
      const updated = {
        ...config,
        engine: "cli-passthrough" as const,
        target_cli: selectedCli,
        cli_templates: {
          ...config.cli_templates,
          [selectedCli]: {
            ...config.cli_templates[selectedCli],
            model: selectedModel,
          },
        },
      };
      await replaceConfig(updated);
    }
    await api.markSetupDone();
    onComplete();
  }, [config, selectedCli, selectedModel, replaceConfig, onComplete]);

  const nextStep = () => {
    setError(null);
    setStep((s) => Math.min(s + 1, 3) as Step);
  };

  const prevStep = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1) as Step);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="px-3 py-3 border-b border-white/15 dark:border-white/5 shrink-0">
        <h2 className="text-[12px] font-semibold text-fg dark:text-fg-dark">欢迎使用 Prompto</h2>
        <p className="text-[10px] text-fg-muted dark:text-fg-dark-muted mt-0.5">完成以下设置即可开始使用</p>
      </div>

      {/* 步骤指示器 */}
      <div className="flex items-center gap-1 px-3 py-2 shrink-0">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors",
              step === s ? "bg-primary text-white" :
              step > s ? "bg-primary/20 text-primary" :
              "bg-white/30 dark:bg-white/10 text-fg-muted dark:text-fg-dark-muted"
            )}>
              {step > s ? <Check className="w-3 h-3" /> : s}
            </div>
            {s < 3 && <ChevronRight className="w-3 h-3 text-fg-muted/30 dark:text-fg-dark-muted/30" />}
          </div>
        ))}
        <span className="ml-2 text-[10px] text-fg-muted dark:text-fg-dark-muted">
          {step === 1 ? "MCP 安装" : step === 2 ? "CLI 配置" : "模型选择"}
        </span>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* 错误提示 */}
        {error && (
          <div className="flex items-start gap-2 p-2 mb-2 rounded-md bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="text-[10px] break-all">{error}</span>
          </div>
        )}

        {/* Step 1: MCP 安装 */}
        {step === 1 && (
          <div className="space-y-2.5">
            <p className="text-[11px] text-fg dark:text-fg-dark">
              将 Prompto MCP 服务安装到你的 IDE，让 AI 助手可以调用改写工具。
            </p>
            <div className="space-y-1.5">
              {mcpStatuses.map((s) => (
                <div key={s.ide} className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-white/30 dark:bg-white/5">
                  <div className="flex items-center gap-2">
                    <Layers className={cn("w-3 h-3", s.installed ? "text-primary" : "text-fg-muted dark:text-fg-dark-muted")} />
                    <span className="text-[11px] font-medium">{s.ide}</span>
                  </div>
                  {s.installed ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">已安装</span>
                  ) : (
                    <button
                      onClick={() => void handleInstallMcp(s.ide)}
                      disabled={installing !== null}
                      className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {installing === s.ide ? <Loader2 className="w-3 h-3 animate-spin" /> : "安装"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[9px] text-fg-muted/60 dark:text-fg-dark-muted/60">
              可选步骤，跳过后也可在设置中手动配置。
            </p>
          </div>
        )}

        {/* Step 2: CLI 获取 */}
        {step === 2 && (
          <div className="space-y-2.5">
            <p className="text-[11px] text-fg dark:text-fg-dark">
              Prompto 通过 CLI 工具调用 AI 模型进行改写。请确保至少安装一个。
            </p>
            <div className="space-y-1.5">
              {clis.map((c) => (
                <div key={c.cli} className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-white/30 dark:bg-white/5">
                  <div className="flex items-center gap-2">
                    <Cpu className={cn("w-3 h-3", c.installed ? "text-primary" : "text-fg-muted dark:text-fg-dark-muted")} />
                    <div>
                      <span className="text-[11px] font-medium">{c.cli}</span>
                      {c.installed && c.version && (
                        <span className="text-[9px] text-fg-muted dark:text-fg-dark-muted ml-1.5">{c.version}</span>
                      )}
                    </div>
                  </div>
                  {c.installed ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">已安装</span>
                  ) : (
                    <button
                      onClick={() => void handleInstallCli(c.cli)}
                      disabled={installing !== null || c.cli === "kiro"}
                      className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {installing === c.cli ? <Loader2 className="w-3 h-3 animate-spin" /> : "安装"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!hasAnyCli && (
              <p className="text-[9px] text-amber-600 dark:text-amber-400">
                ⚠ 未检测到已安装的 CLI，点击"安装"自动通过 npm 全局安装。
              </p>
            )}
          </div>
        )}

        {/* Step 3: 模型选择 */}
        {step === 3 && (
          <div className="space-y-2.5">
            <p className="text-[11px] text-fg dark:text-fg-dark">
              选择默认使用的 CLI 和模型。
            </p>

            <Field label="目标 CLI">
              <div className="flex items-center gap-1">
                {(["claude", "codex", "kiro"] as TargetCli[]).map((cli) => {
                  const cliInfo = clis.find((c) => c.cli === cli);
                  return (
                    <button
                      key={cli}
                      onClick={() => { setSelectedCli(cli); setSelectedModel(""); }}
                      disabled={!cliInfo?.installed}
                      className={cn(
                        "px-2.5 py-1 text-[10px] rounded cursor-pointer transition-colors",
                        selectedCli === cli ? "bg-primary/10 text-primary font-semibold" : "text-fg-muted dark:text-fg-dark-muted hover:text-fg dark:hover:text-fg-dark",
                        !cliInfo?.installed && "opacity-30 cursor-not-allowed"
                      )}
                    >
                      {cli}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="模型">
              <div className="space-y-1">
                {models.length === 0 && (
                  <p className="text-[10px] text-fg-muted dark:text-fg-dark-muted py-2">加载模型列表中...</p>
                )}
                {models.map((m) => (
                  <label key={m.slug} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="model"
                      value={m.slug}
                      checked={selectedModel === m.slug}
                      onChange={() => setSelectedModel(m.slug)}
                      className="w-3 h-3 accent-primary"
                    />
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium">{m.display_name}</span>
                      {m.description && (
                        <span className="text-[9px] text-fg-muted dark:text-fg-dark-muted">{m.description}</span>
                      )}
                    </div>
                    {m.reasoning_levels.length > 0 && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary ml-auto shrink-0">
                        推理
                      </span>
                    )}
                  </label>
                ))}
                <label className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="model"
                    value=""
                    checked={selectedModel === ""}
                    onChange={() => setSelectedModel("")}
                    className="w-3 h-3 accent-primary"
                  />
                  <span className="text-[11px] text-fg-muted dark:text-fg-dark-muted">使用 CLI 默认模型</span>
                </label>
              </div>
            </Field>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/15 dark:border-white/5 shrink-0">
        <button
          onClick={step === 1 ? onComplete : prevStep}
          className="btn-ghost !text-[10px] !px-2 !py-1"
        >
          {step === 1 ? "跳过引导" : "上一步"}
        </button>
        <button
          onClick={step === 3 ? () => void handleFinish() : nextStep}
          className="btn-primary !text-[10px] !px-3 !py-1.5"
        >
          {step === 3 ? "完成" : "下一步"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-fg-muted dark:text-fg-dark-muted">{label}</label>
      {children}
    </div>
  );
}
