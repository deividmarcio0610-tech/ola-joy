import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { askOllama } from "@/lib/ollama.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calculadora Simples com IA" },
      {
        name: "description",
        content:
          "Calculadora simples com teclado, histórico e um assistente de IA para resolver cálculos em linguagem natural.",
      },
      { property: "og:title", content: "Calculadora Simples com IA" },
      {
        property: "og:description",
        content:
          "Calculadora simples com teclado, histórico e assistente de IA para cálculos em linguagem natural.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Op = "+" | "-" | "*" | "/";

function compute(a: number, b: number, op: Op) {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? NaN : a / b;
  }
}

function format(value: number) {
  if (!Number.isFinite(value)) return "Erro";
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}

function Index() {
  const [display, setDisplay] = useState("0");
  const [previous, setPrevious] = useState<number | null>(null);
  const [operator, setOperator] = useState<Op | null>(null);
  const [resetNext, setResetNext] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ask = useServerFn(askOllama);

  const handleNumber = useCallback(
    (num: string) => {
      setDisplay((current) => {
        if (resetNext) return num;
        if (current === "0" || current === "Erro") return num;
        return current.length >= 12 ? current : current + num;
      });
      setResetNext(false);
    },
    [resetNext],
  );

  const handleDecimal = useCallback(() => {
    setDisplay((current) => {
      if (resetNext) return "0.";
      return current.includes(".") ? current : current + ".";
    });
    setResetNext(false);
  }, [resetNext]);

  const handleOperator = useCallback(
    (op: Op) => {
      const currentValue = parseFloat(display);
      if (previous !== null && operator && !resetNext) {
        const result = compute(previous, currentValue, operator);
        setHistory((h) =>
          [`${previous} ${operator} ${currentValue} = ${format(result)}`, ...h].slice(0, 8),
        );
        setPrevious(Number.isFinite(result) ? result : null);
        setDisplay(format(result));
      } else {
        setPrevious(Number.isFinite(currentValue) ? currentValue : null);
      }
      setOperator(op);
      setResetNext(true);
    },
    [display, operator, previous, resetNext],
  );

  const calculate = useCallback(() => {
    if (previous === null || !operator) return;
    const currentValue = parseFloat(display);
    const result = compute(previous, currentValue, operator);
    setHistory((h) =>
      [`${previous} ${operator} ${currentValue} = ${format(result)}`, ...h].slice(0, 8),
    );
    setDisplay(format(result));
    setPrevious(null);
    setOperator(null);
    setResetNext(true);
  }, [display, operator, previous]);

  const clear = useCallback(() => {
    setDisplay("0");
    setPrevious(null);
    setOperator(null);
    setResetNext(false);
  }, []);

  const backspace = useCallback(() => {
    setDisplay((current) =>
      current.length <= 1 || current === "Erro" ? "0" : current.slice(0, -1),
    );
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const key = event.key;
      if (/^[0-9]$/.test(key)) handleNumber(key);
      else if (key === "." || key === ",") handleDecimal();
      else if (key === "+" || key === "-" || key === "*" || key === "/") handleOperator(key);
      else if (key === "Enter" || key === "=") {
        event.preventDefault();
        calculate();
      } else if (key === "Backspace") backspace();
      else if (key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backspace, calculate, clear, handleDecimal, handleNumber, handleOperator]);

  const buttons: {
    label: string;
    onClick: () => void;
    variant: "default" | "primary" | "secondary" | "accent";
    span?: number;
  }[] = [
    { label: "C", onClick: clear, variant: "secondary" },
    { label: "⌫", onClick: backspace, variant: "secondary", span: 2 },
    { label: "÷", onClick: () => handleOperator("/"), variant: "accent" },
    { label: "7", onClick: () => handleNumber("7"), variant: "default" },
    { label: "8", onClick: () => handleNumber("8"), variant: "default" },
    { label: "9", onClick: () => handleNumber("9"), variant: "default" },
    { label: "×", onClick: () => handleOperator("*"), variant: "accent" },
    { label: "4", onClick: () => handleNumber("4"), variant: "default" },
    { label: "5", onClick: () => handleNumber("5"), variant: "default" },
    { label: "6", onClick: () => handleNumber("6"), variant: "default" },
    { label: "−", onClick: () => handleOperator("-"), variant: "accent" },
    { label: "1", onClick: () => handleNumber("1"), variant: "default" },
    { label: "2", onClick: () => handleNumber("2"), variant: "default" },
    { label: "3", onClick: () => handleNumber("3"), variant: "default" },
    { label: "+", onClick: () => handleOperator("+"), variant: "accent" },
    { label: "0", onClick: () => handleNumber("0"), variant: "default", span: 2 },
    { label: ".", onClick: handleDecimal, variant: "default" },
    { label: "=", onClick: calculate, variant: "primary" },
  ];

  const onAsk = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || loading) return;
    setLoading(true);
    setAiError(null);
    setAnswer(null);
    try {
      const result = await ask({ data: { prompt: question } });
      setAnswer(result.text);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Falha ao consultar a IA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-background p-6">
      <header className="mb-6 w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Calculadora
          <span className="ml-2 text-primary">verde</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Cálculos rápidos com teclado, histórico e assistente de IA.
        </p>
      </header>
      <div className="grid w-full max-w-3xl gap-6 md:grid-cols-2">
        <section
          className="rounded-3xl p-6 ring-1 ring-border"
          style={{
            backgroundImage: "var(--gradient-surface)",
            boxShadow: "var(--shadow-elegant)",
          }}
        >
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Teclado
          </h2>

          <div className="mb-6 rounded-2xl bg-muted p-4 text-right">

            <div className="h-5 text-xs text-muted-foreground">
              {previous !== null && operator ? `${previous} ${operator}` : ""}
            </div>
            <div className="truncate text-4xl font-semibold tracking-tight text-foreground">
              {display}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {buttons.map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={btn.onClick}
                className={cn(
                  "h-16 rounded-2xl text-xl font-medium transition-transform active:scale-95",
                  btn.variant === "primary" &&
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                  btn.variant === "secondary" &&
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  btn.variant === "accent" &&
                    "bg-accent text-accent-foreground hover:bg-accent/80",
                  btn.variant === "default" &&
                    "bg-background text-foreground ring-1 ring-border hover:bg-muted",
                  btn.span === 3 && "col-span-3",
                  btn.span === 2 && "col-span-2",
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Histórico
              </h2>
              <ul className="space-y-1 text-right text-sm text-muted-foreground">
                {history.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-2xl ring-1 ring-border">
          <h2 className="mb-1 text-lg font-semibold text-foreground">Assistente IA</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Pergunte um cálculo em linguagem natural.
          </p>

          <form onSubmit={onAsk} className="space-y-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              placeholder="Ex.: quanto é 15% de 240?"
              className="w-full resize-none rounded-2xl bg-muted p-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Pensando..." : "Perguntar"}
            </button>
          </form>

          {aiError && (
            <p className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {aiError}
            </p>
          )}

          {answer && (
            <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-muted p-3 text-sm text-foreground">
              {answer}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
