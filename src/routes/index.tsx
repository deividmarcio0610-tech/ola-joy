import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calculadora Simples" },
      { name: "description", content: "Uma calculadora simples e elegante para operações do dia a dia." },
      { property: "og:title", content: "Calculadora Simples" },
      { property: "og:description", content: "Uma calculadora simples e elegante para operações do dia a dia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [display, setDisplay] = useState("0");
  const [previous, setPrevious] = useState<string | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  const handleNumber = (num: string) => {
    if (resetNext) {
      setDisplay(num);
      setResetNext(false);
    } else {
      setDisplay(display === "0" ? num : display + num);
    }
  };

  const handleDecimal = () => {
    if (resetNext) {
      setDisplay("0.");
      setResetNext(false);
    } else if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const handleOperator = (op: string) => {
    setPrevious(display);
    setOperator(op);
    setResetNext(true);
  };

  const calculate = () => {
    if (!previous || !operator) return;

    const a = parseFloat(previous);
    const b = parseFloat(display);
    let result = 0;

    switch (operator) {
      case "+":
        result = a + b;
        break;
      case "-":
        result = a - b;
        break;
      case "*":
        result = a * b;
        break;
      case "/":
        result = b === 0 ? 0 : a / b;
        break;
    }

    setDisplay(String(result).slice(0, 12));
    setPrevious(null);
    setOperator(null);
    setResetNext(true);
  };

  const clear = () => {
    setDisplay("0");
    setPrevious(null);
    setOperator(null);
    setResetNext(false);
  };

  const buttons = [
    { label: "C", onClick: clear, variant: "secondary" },
    { label: "÷", onClick: () => handleOperator("/"), variant: "accent" },
    { label: "×", onClick: () => handleOperator("*"), variant: "accent" },
    { label: "-", onClick: () => handleOperator("-"), variant: "accent" },
    { label: "7", onClick: () => handleNumber("7"), variant: "default" },
    { label: "8", onClick: () => handleNumber("8"), variant: "default" },
    { label: "9", onClick: () => handleNumber("9"), variant: "default" },
    { label: "+", onClick: () => handleOperator("+"), variant: "accent" },
    { label: "4", onClick: () => handleNumber("4"), variant: "default" },
    { label: "5", onClick: () => handleNumber("5"), variant: "default" },
    { label: "6", onClick: () => handleNumber("6"), variant: "default" },
    { label: "=", onClick: calculate, variant: "primary" },
    { label: "1", onClick: () => handleNumber("1"), variant: "default" },
    { label: "2", onClick: () => handleNumber("2"), variant: "default" },
    { label: "3", onClick: () => handleNumber("3"), variant: "default" },
    { label: "0", onClick: () => handleNumber("0"), variant: "default" },
    { label: ".", onClick: handleDecimal, variant: "default" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl ring-1 ring-border">
        <div className="mb-6 rounded-2xl bg-muted p-4 text-right">
          <div className="text-xs text-muted-foreground h-5">
            {previous ? `${previous} ${operator}` : ""}
          </div>
          <div className="text-4xl font-semibold tracking-tight text-foreground">
            {display}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {buttons.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              className={cn(
                "h-16 rounded-2xl text-xl font-medium transition-transform active:scale-95",
                btn.variant === "primary" &&
                  "col-span-1 bg-primary text-primary-foreground hover:bg-primary/90",
                btn.variant === "secondary" &&
                  "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                btn.variant === "accent" &&
                  "bg-accent text-accent-foreground hover:bg-accent/80",
                btn.variant === "default" &&
                  "bg-background text-foreground hover:bg-muted ring-1 ring-border",
                btn.label === "0" && "col-span-1",
                btn.label === "=" && "row-span-2 h-auto"
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

