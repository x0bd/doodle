"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";
import { useTheme } from "next-themes";
import {
	SunIcon,
	MoonIcon,
	PencilIcon,
	CalculatorIcon,
	UndoIcon,
	RotateCcwIcon,
	Sparkles,
} from "lucide-react";

interface GeneratedResult {
	expression: string;
	answer: string;
}

interface Response {
	expr: string;
	result: string;
	assign: boolean;
}

// Enhanced premium color palette
const COLORS = [
	{ name: "White", value: "#FFFFFF" },
	{ name: "Black", value: "#000000" },
	{ name: "Vercel Blue", value: "#0070F3" },
	{ name: "Cyan", value: "#50E3C2" },
	{ name: "Crimson", value: "#FF4785" },
	{ name: "Sage", value: "#2DD4BF" },
	{ name: "Amber", value: "#F59E0B" },
	{ name: "Violet", value: "#8B5CF6" },
];

interface ColorSwatchProps {
	color: { name: string; value: string };
	selected?: boolean;
	onClick: () => void;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({
	color,
	selected,
	onClick,
}) => {
	return (
		<button
			className={cn(
				"w-8 h-8 rounded-full transition-all",
				selected
					? "ring-2 ring-white/90 ring-offset-2 ring-offset-black/20 scale-110 z-10 shadow-[0_0_15px_rgba(0,0,0,0.2)]"
					: "opacity-85 hover:opacity-100 hover:scale-105"
			)}
			style={{
				backgroundColor: color.value,
				boxShadow: selected ? `0 0 15px ${color.value}80` : "none",
			}}
			onClick={onClick}
			type="button"
			aria-label={`Select ${color.name} color`}
			title={color.name}
		/>
	);
};

interface ColorSwatchesProps {
	value: string;
	onChange: (color: string) => void;
}

const ColorSwatches: React.FC<ColorSwatchesProps> = ({ value, onChange }) => {
	return (
		<div className="flex gap-3 items-center justify-center py-2 px-4">
			{COLORS.map((color) => (
				<ColorSwatch
					key={color.value}
					color={color}
					selected={value === color.value}
					onClick={() => onChange(color.value)}
				/>
			))}
		</div>
	);
};

// Premium floating navbar component
const FloatingNavbar: React.FC = () => {
	const { theme, setTheme } = useTheme();

	return (
		<div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50">
			<div className="flex items-center px-6 py-2.5 rounded-full bg-background/80 backdrop-blur-xl border border-border shadow-lg">
				<div className="flex items-center gap-2">
					<div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm">
						<PencilIcon className="h-3.5 w-3.5 text-primary-foreground" />
					</div>
					<h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent mr-4">
						Doodle
					</h1>
				</div>

				<div className="mx-3 h-5 w-px bg-border"></div>

				<div className="flex items-center gap-5">
					<button className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
						<CalculatorIcon className="h-3.5 w-3.5" />
						<span>Calculator</span>
					</button>
					<button className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
						<RotateCcwIcon className="h-3.5 w-3.5" />
						<span>History</span>
					</button>
				</div>

				<div className="ml-auto">
					<button
						onClick={() =>
							setTheme(theme === "dark" ? "light" : "dark")
						}
						className="p-1.5 rounded-full hover:bg-muted transition-colors"
						aria-label="Toggle theme"
					>
						{theme === "dark" ? (
							<SunIcon className="h-4 w-4" />
						) : (
							<MoonIcon className="h-4 w-4" />
						)}
					</button>
				</div>
			</div>
		</div>
	);
};

// Draggable component with enhanced visuals
const Draggable: React.FC<{
	children: React.ReactNode;
	defaultPosition: { x: number; y: number };
	onStop: (position: { x: number; y: number }) => void;
}> = ({ children, defaultPosition, onStop }) => {
	const [position, setPosition] = useState(defaultPosition);
	const [isDragging, setIsDragging] = useState(false);
	const dragRef = useRef<HTMLDivElement>(null);
	const offset = useRef({ x: 0, y: 0 });

	const handleMouseDown = (e: React.MouseEvent) => {
		if (dragRef.current) {
			setIsDragging(true);
			const rect = dragRef.current.getBoundingClientRect();
			offset.current = {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
			};
		}
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (isDragging && dragRef.current) {
			const x = e.clientX - offset.current.x;
			const y = e.clientY - offset.current.y;
			setPosition({ x, y });
		}
	};

	const handleMouseUp = () => {
		if (isDragging) {
			setIsDragging(false);
			onStop(position);
		}
	};

	useEffect(() => {
		if (isDragging) {
			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		}

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging]);

	return (
		<div
			ref={dragRef}
			style={{
				position: "absolute",
				left: `${position.x}px`,
				top: `${position.y}px`,
				cursor: isDragging ? "grabbing" : "grab",
				zIndex: 50,
			}}
			onMouseDown={handleMouseDown}
			className="transition-shadow duration-200 hover:shadow-lg"
		>
			<div className="flex items-center gap-1">
				<div className="h-6 w-6 rounded-full bg-background/50 backdrop-blur-md flex items-center justify-center border border-border/50">
					<DragHandleDots2Icon className="h-3.5 w-3.5 text-muted-foreground" />
				</div>
				{children}
			</div>
		</div>
	);
};

export default function AiCalculator() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [color, setColor] = useState(COLORS[2].value); // Default to Vercel blue
	const [dictOfVars, setDictOfVars] = useState<Record<string, string>>({});
	const [result, setResult] = useState<GeneratedResult | undefined>();
	const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });
	const [latexExpression, setLatexExpression] = useState<Array<string>>([]);
	const { theme } = useTheme();
	const [calcStatus, setCalcStatus] = useState<"idle" | "calculating">(
		"idle"
	);
	const [brushSize, setBrushSize] = useState(3);
	const [showWelcome, setShowWelcome] = useState(true);

	useEffect(() => {
		if (latexExpression.length > 0 && window.MathJax) {
			setTimeout(() => {
				window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
			}, 0);
		}
	}, [latexExpression]);

	useEffect(() => {
		if (result) {
			renderLatexToCanvas(result.expression, result.answer);
		}
	}, [result]);

	useEffect(() => {
		const canvas = canvasRef.current;

		if (canvas) {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				canvas.width = window.innerWidth;
				canvas.height = window.innerHeight - canvas.offsetTop;
				ctx.lineCap = "round";
				ctx.lineWidth = brushSize;
			}
		}

		const script = document.createElement("script");
		script.src =
			"https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML";
		script.async = true;
		document.head.appendChild(script);

		script.onload = () => {
			if (window.MathJax) {
				window.MathJax.Hub.Config({
					tex2jax: {
						inlineMath: [
							["$", "$"],
							["$$", "$$"],
						],
					},
				});
			}
		};

		const handleResize = () => {
			if (canvas) {
				canvas.width = window.innerWidth;
				canvas.height = window.innerHeight - canvas.offsetTop;
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.lineCap = "round";
					ctx.lineWidth = brushSize;
				}
			}
		};

		window.addEventListener("resize", handleResize);

		return () => {
			document.head.removeChild(script);
			window.removeEventListener("resize", handleResize);
		};
	}, [brushSize]);

	const renderLatexToCanvas = (expression: string, answer: string) => {
		const latex = `\$$\\LARGE{${expression} = ${answer}}\$$`;
		setLatexExpression([...latexExpression, latex]);

		// Clear the main canvas
		resetCanvas();
	};

	const resetCanvas = () => {
		const canvas = canvasRef.current;
		if (canvas) {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
			}
		}
	};

	const handleReset = () => {
		resetCanvas();
		setLatexExpression([]);
		setResult(undefined);
		setDictOfVars({});
	};

	const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (canvas) {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.beginPath();
				ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
				setIsDrawing(true);
			}
		}
		setShowWelcome(false);
	};

	const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (!isDrawing) {
			return;
		}
		const canvas = canvasRef.current;
		if (canvas) {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.strokeStyle = color;
				ctx.lineWidth = brushSize;
				ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
				ctx.stroke();
			}
		}
	};

	const stopDrawing = () => {
		setIsDrawing(false);
	};

	const runCalculation = async () => {
		const canvas = canvasRef.current;

		if (canvas) {
			setCalcStatus("calculating");

			// Mock response for now
			const mockResponse = {
				data: [
					{
						expr: "x^2 + 3x - 5",
						result: "42",
						assign: false,
					},
				],
			};

			mockResponse.data.forEach((data: Response) => {
				if (data.assign === true) {
					setDictOfVars({
						...dictOfVars,
						[data.expr]: data.result,
					});
				}
			});

			const ctx = canvas.getContext("2d");
			if (ctx) {
				const imageData = ctx.getImageData(
					0,
					0,
					canvas.width,
					canvas.height
				);
				let minX = canvas.width,
					minY = canvas.height,
					maxX = 0,
					maxY = 0;

				for (let y = 0; y < canvas.height; y++) {
					for (let x = 0; x < canvas.width; x++) {
						const i = (y * canvas.width + x) * 4;
						if (imageData.data[i + 3] > 0) {
							// If pixel is not transparent
							minX = Math.min(minX, x);
							minY = Math.min(minY, y);
							maxX = Math.max(maxX, x);
							maxY = Math.max(maxY, y);
						}
					}
				}

				const centerX = (minX + maxX) / 2;
				const centerY = (minY + maxY) / 2;

				setLatexPosition({ x: centerX, y: centerY });
				setTimeout(() => {
					mockResponse.data.forEach((data: Response) => {
						setResult({
							expression: data.expr,
							answer: data.result,
						});
					});
					setCalcStatus("idle");
				}, 1500);
			}
		}
	};

	return (
		<div className="relative min-h-screen bg-gradient-to-br from-background to-background/90 overflow-hidden">
			{/* Subtle Grid Background */}
			<div className="absolute inset-0 bg-grid-pattern opacity-[0.03]"></div>

			{/* Ambient Glow Effects */}
			<div className="absolute top-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none"></div>
			<div className="absolute bottom-[-10%] left-[-5%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

			{/* Canvas Background Frame */}
			<div className="absolute inset-0 flex items-center justify-center p-16">
				<div className="w-full h-full rounded-3xl border border-border/40 bg-background/5 backdrop-blur-[2px] shadow-sm"></div>
			</div>

			{/* Navbar */}
			<FloatingNavbar />

			{/* Drawing Canvas */}
			<canvas
				ref={canvasRef}
				id="canvas"
				className="absolute top-0 left-0 w-full h-full"
				onMouseDown={startDrawing}
				onMouseMove={draw}
				onMouseUp={stopDrawing}
				onMouseOut={stopDrawing}
			/>

			{/* Brush Size Controls */}
			<div className="absolute left-6 top-1/2 transform -translate-y-1/2">
				<Card className="bg-background/80 backdrop-blur-xl border border-border p-3 rounded-xl shadow-sm">
					<div className="flex flex-col items-center gap-3">
						<span className="text-xs font-medium text-muted-foreground">
							Brush
						</span>
						<input
							type="range"
							min="1"
							max="10"
							value={brushSize}
							onChange={(e) =>
								setBrushSize(Number.parseInt(e.target.value))
							}
							className="w-5 h-24 appearance-none bg-transparent outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-runnable-track]:w-1 [&::-webkit-slider-runnable-track]:h-24 [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-runnable-track]:rounded-full"
							style={{ writingMode: "bt-lr" }}
						/>
						<div
							className="rounded-full"
							style={{
								width: `${brushSize * 2}px`,
								height: `${brushSize * 2}px`,
								backgroundColor: color,
							}}
						></div>
					</div>
				</Card>
			</div>

			{/* Action Buttons */}
			<div className="absolute top-6 right-6 flex gap-3">
				<Button
					onClick={handleReset}
					variant="outline"
					size="sm"
					className="h-9 px-3 rounded-lg text-xs shadow-sm"
				>
					<UndoIcon className="h-3.5 w-3.5 mr-1.5" />
					Reset
				</Button>

				<Button
					onClick={runCalculation}
					disabled={calcStatus === "calculating"}
					size="sm"
					className={cn(
						"h-9 px-4 rounded-lg text-xs shadow-sm",
						calcStatus === "calculating" ? "opacity-80" : ""
					)}
				>
					{calcStatus === "calculating" ? (
						<>
							<div className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full mr-1.5"></div>
							Processing...
						</>
					) : (
						<>
							<CalculatorIcon className="h-3.5 w-3.5 mr-1.5" />
							Calculate
						</>
					)}
				</Button>
			</div>

			{/* Color Palette */}
			<div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
				<div className="relative">
					{/* Subtle reflection effect */}
					<div className="absolute -bottom-4 left-0 right-0 h-6 bg-gradient-to-b from-background/20 to-transparent rounded-full blur-md mx-8"></div>

					<Card className="bg-background/80 backdrop-blur-xl border border-border px-4 py-2 rounded-full shadow-sm">
						<ColorSwatches value={color} onChange={setColor} />
					</Card>
				</div>
			</div>

			{/* LaTeX Results */}
			{latexExpression.map((latex, index) => (
				<Draggable
					key={index}
					defaultPosition={latexPosition}
					onStop={(position) => setLatexPosition(position)}
				>
					<Card className="bg-background/90 backdrop-blur-xl border border-border rounded-lg shadow-sm text-foreground min-w-64">
						<div className="p-3">
							<div className="flex items-center justify-between mb-2">
								<div className="flex gap-1.5">
									<div className="h-2.5 w-2.5 rounded-full bg-red-500/80"></div>
									<div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80"></div>
									<div className="h-2.5 w-2.5 rounded-full bg-green-500/80"></div>
								</div>
								<div className="text-xs text-muted-foreground font-medium">
									Result
								</div>
							</div>
							<div
								className="latex-content bg-muted/50 p-3 rounded-md"
								dangerouslySetInnerHTML={{ __html: latex }}
							/>
						</div>
					</Card>
				</Draggable>
			))}

			{/* Welcome/Guide Overlay */}
			{showWelcome && latexExpression.length === 0 && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-sm">
					<Card className="bg-background/95 backdrop-blur-xl border border-border rounded-xl w-96 max-w-full shadow-sm">
						<div className="p-6 text-center">
							<div className="h-14 w-14 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
								<Sparkles className="h-7 w-7 text-primary-foreground" />
							</div>
							<h2 className="text-xl font-bold mb-2">
								Draw to Calculate
							</h2>
							<p className="text-muted-foreground text-sm mb-5">
								Write any mathematical expression on the canvas
								with your selected color and press Calculate to
								solve it instantly
							</p>
							<Button
								onClick={() => setShowWelcome(false)}
								className="rounded-lg w-full"
							>
								Get Started
							</Button>
						</div>
					</Card>
				</div>
			)}

			{/* Loading State Overlay */}
			{calcStatus === "calculating" && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/10 backdrop-blur-sm pointer-events-none">
					<div className="bg-background/90 backdrop-blur-xl p-4 rounded-xl flex items-center gap-4 border border-border shadow-sm">
						<div className="h-7 w-7 rounded-full border-2 border-l-transparent border-primary animate-spin"></div>
						<div className="text-foreground text-sm font-medium">
							Processing expression...
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// Add MathJax type declaration
declare global {
	interface Window {
		MathJax: {
			Hub: {
				Queue: (args: any[]) => void;
				Config: (config: any) => void;
			};
		};
	}
}
