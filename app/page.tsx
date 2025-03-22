"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";
import { useTheme } from "next-themes";
import {
	SunIcon,
	MoonIcon,
	PencilIcon,
	CalculatorIcon,
	UndoIcon,
	Sparkles,
	Eraser,
	X,
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

// Brutalist color palette
const COLORS = [
	{ name: "White", value: "#FFFFFF" },
	{ name: "Black", value: "#000000" },
	{ name: "Vercel Blue", value: "#0070F3" },
	{ name: "Cyan", value: "#00C7B7" },
	{ name: "Red", value: "#FF0000" },
	{ name: "Yellow", value: "#FFFF00" },
	{ name: "Green", value: "#00FF00" },
	{ name: "Magenta", value: "#FF00FF" },
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
				"w-10 h-10 transition-all duration-200 border border-border hover:scale-110",
				selected
					? "outline outline-2 outline-offset-2 outline-foreground z-10 shadow-[0_0_10px_rgba(0,0,0,0.2)]"
					: "opacity-85 hover:opacity-100"
			)}
			style={{
				backgroundColor: color.value,
			}}
			onClick={onClick}
			type="button"
			aria-label={`Select ${color.name} color`}
			title={color.name}
		/>
	);
};

// Minimal header component
const MinimalHeader: React.FC = () => {
	return (
		<div className="fixed top-0 left-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
			<div className="flex items-center justify-between h-14 px-4">
				<div className="flex items-center gap-2">
					<div className="h-8 w-8 bg-foreground flex items-center justify-center">
						<PencilIcon className="h-4 w-4 text-background" />
					</div>
					<h1 className="text-xl font-mono font-bold tracking-tight">
						DOODLE
					</h1>
				</div>
				<div className="text-xs font-mono text-muted-foreground">
					MATH CALCULATOR v1.0
				</div>
			</div>
		</div>
	);
};

// Draggable component with brutalist visuals
const Draggable: React.FC<{
	children: React.ReactNode;
	defaultPosition: { x: number; y: number };
	onStop: (position: { x: number; y: number }) => void;
	onClose?: () => void;
}> = ({ children, defaultPosition, onStop, onClose }) => {
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
			className="transition-transform duration-200 shadow-lg hover:shadow-xl"
		>
			<div className="flex flex-col">
				<div
					className="h-7 bg-foreground flex items-center justify-between px-3 cursor-grab"
					onMouseDown={handleMouseDown}
				>
					<div className="flex items-center gap-2">
						<DragHandleDots2Icon className="h-3.5 w-3.5 text-background" />
						<span className="text-xs font-mono font-bold text-background tracking-wider">
							RESULT
						</span>
					</div>
					{onClose && (
						<button
							onClick={onClose}
							className="text-background hover:text-background/80 transition-colors duration-200"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					)}
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
	const [latexExpression, setLatexExpression] = useState<
		Array<{ id: string; latex: string }>
	>([]);
	const { theme, setTheme } = useTheme();
	const [calcStatus, setCalcStatus] = useState<"idle" | "calculating">(
		"idle"
	);
	const [brushSize, setBrushSize] = useState(3);
	const [showWelcome, setShowWelcome] = useState(true);
	const [isEraserMode, setIsEraserMode] = useState(false);
	const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

	// Track cursor position for custom cursor
	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			setCursorPosition({ x: e.clientX, y: e.clientY });
		};

		window.addEventListener("mousemove", handleMouseMove);
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, []);

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
				ctx.lineCap = "square"; // Changed to square for brutalist style
				ctx.lineJoin = "miter"; // Sharp corners
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
					ctx.lineCap = "square";
					ctx.lineJoin = "miter";
					ctx.lineWidth = brushSize;
				}
			}
		};

		window.addEventListener("resize", handleResize);

		return () => {
			if (document.head.contains(script)) {
				document.head.removeChild(script);
			}
			window.removeEventListener("resize", handleResize);
		};
	}, [brushSize]);

	const renderLatexToCanvas = (expression: string, answer: string) => {
		const latex = `\$$\\LARGE{${expression} = ${answer}}\$$`;
		const id = Date.now().toString();
		setLatexExpression([...latexExpression, { id, latex }]);

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

	const toggleEraserMode = () => {
		setIsEraserMode(!isEraserMode);
	};

	const removeLatexExpression = (id: string) => {
		setLatexExpression(latexExpression.filter((expr) => expr.id !== id));
	};

	const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (canvas) {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.beginPath();
				if (isEraserMode) {
					ctx.globalCompositeOperation = "destination-out";
					ctx.strokeStyle = "rgba(0,0,0,1)";
				} else {
					ctx.globalCompositeOperation = "source-over";
					ctx.strokeStyle = color;
				}
				ctx.lineWidth = brushSize;
				ctx.lineCap = "square";
				ctx.lineJoin = "miter";
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
				if (isEraserMode) {
					ctx.globalCompositeOperation = "destination-out";
					ctx.strokeStyle = "rgba(0,0,0,1)";
				} else {
					ctx.globalCompositeOperation = "source-over";
					ctx.strokeStyle = color;
				}
				// Ensure brush size is applied
				ctx.lineWidth = brushSize;
				ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
				ctx.stroke();

				// Begin a new path to ensure consistent line width
				ctx.beginPath();
				ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
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
		<div className="relative min-h-screen bg-background overflow-hidden font-mono">
			{/* Grid Background */}
			<div className="absolute inset-0 bg-grid-pattern opacity-[0.03]"></div>

			{/* Minimal Header */}
			<MinimalHeader />

			{/* Drawing Canvas */}
			<canvas
				ref={canvasRef}
				id="canvas"
				className="absolute top-14 left-0 w-full h-[calc(100vh-56px)]"
				onMouseDown={startDrawing}
				onMouseMove={draw}
				onMouseUp={stopDrawing}
				onMouseOut={stopDrawing}
			/>

			{/* Custom cursor */}
			{!isDrawing && (
				<div
					className="pointer-events-none fixed z-50 transform -translate-x-1/2 -translate-y-1/2"
					style={{
						left: `${cursorPosition.x}px`,
						top: `${cursorPosition.y}px`,
						width: `${brushSize}px`,
						height: `${brushSize}px`,
						backgroundColor: isEraserMode ? "transparent" : color,
						border: isEraserMode ? "1px solid #000" : "none",
						opacity: 0.7,
					}}
				/>
			)}

			{/* Brush Size Controls */}
			<div className="fixed left-0 top-1/2 transform -translate-y-1/2 z-40">
				<div className="bg-background border border-border p-4 shadow-md transition-transform duration-200 hover:translate-x-1">
					<div className="flex flex-col items-center gap-4">
						<span className="text-xs uppercase font-bold tracking-wider">
							{isEraserMode ? "Eraser" : "Brush"}
						</span>
						<input
							type="range"
							min="1"
							max="20"
							value={brushSize}
							onChange={(e) =>
								setBrushSize(Number.parseInt(e.target.value))
							}
							className="w-6 h-32 appearance-none bg-transparent outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-runnable-track]:w-1.5 [&::-webkit-slider-runnable-track]:h-32 [&::-webkit-slider-runnable-track]:bg-border"
							style={{ writingMode: "bt-lr" }}
						/>
						<div className="mt-2 text-xs font-mono">
							{brushSize}px
						</div>
						<div
							className={cn(
								"transition-all duration-200",
								isEraserMode ? "border-2 border-foreground" : ""
							)}
							style={{
								width: `${brushSize * 2}px`,
								height: `${brushSize * 2}px`,
								backgroundColor: isEraserMode
									? undefined
									: color,
							}}
						></div>
					</div>
				</div>
			</div>

			{/* Color Palette - Grid Layout on Right */}
			<div className="fixed right-0 top-14 bottom-14 z-40 flex flex-col justify-center">
				<div className="bg-background border-l border-y border-border p-4 shadow-md transition-transform duration-200 hover:-translate-x-1">
					<div className="grid grid-cols-2 gap-3">
						{COLORS.slice(0, 6).map((colorItem) => (
							<ColorSwatch
								key={colorItem.value}
								color={colorItem}
								selected={
									!isEraserMode && color === colorItem.value
								}
								onClick={() => {
									setColor(colorItem.value);
									setIsEraserMode(false);
								}}
							/>
						))}
						<ColorSwatch
							color={COLORS[6]}
							selected={
								!isEraserMode && color === COLORS[6].value
							}
							onClick={() => {
								setColor(COLORS[6].value);
								setIsEraserMode(false);
							}}
						/>
						<button
							className={cn(
								"w-10 h-10 flex items-center justify-center border border-border bg-background transition-all duration-200 hover:border-foreground",
								isEraserMode
									? "outline outline-2 outline-offset-2 outline-foreground"
									: ""
							)}
							onClick={toggleEraserMode}
							type="button"
							aria-label="Eraser tool"
							title="Eraser"
						>
							<Eraser className="h-5 w-5" />
						</button>
					</div>
				</div>
			</div>

			{/* Bottom Action Bar */}
			<div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background h-14 flex items-center justify-between px-4">
				<Button
					onClick={handleReset}
					variant="outline"
					size="sm"
					className="h-8 border-foreground hover:bg-foreground hover:text-background transition-colors duration-200"
				>
					<UndoIcon className="h-4 w-4 mr-2" />
					RESET
				</Button>

				<div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
					<Button
						onClick={runCalculation}
						disabled={calcStatus === "calculating"}
						size="sm"
						className={cn(
							"h-10 px-6 bg-foreground text-background hover:bg-foreground/90 transition-all duration-200 hover:scale-105",
							calcStatus === "calculating" ? "opacity-80" : ""
						)}
					>
						{calcStatus === "calculating" ? (
							<>
								<div className="animate-spin h-3.5 w-3.5 border-2 border-background border-t-transparent mr-2"></div>
								PROCESSING...
							</>
						) : (
							<>
								<CalculatorIcon className="h-3.5 w-3.5 mr-2" />
								CALCULATE
							</>
						)}
					</Button>
				</div>

				<Button
					onClick={() =>
						setTheme(theme === "dark" ? "light" : "dark")
					}
					variant="outline"
					size="icon"
					className="h-8 w-8 border-foreground hover:bg-foreground hover:text-background transition-colors duration-200"
				>
					{theme === "dark" ? (
						<SunIcon className="h-4 w-4" />
					) : (
						<MoonIcon className="h-4 w-4" />
					)}
				</Button>
			</div>

			{/* LaTeX Results */}
			{latexExpression.map((expr) => (
				<Draggable
					key={expr.id}
					defaultPosition={latexPosition}
					onStop={(position) => setLatexPosition(position)}
					onClose={() => removeLatexExpression(expr.id)}
				>
					<div className="bg-background border border-border border-t-0 min-w-64">
						<div className="p-3">
							<div
								className="bg-muted p-3"
								dangerouslySetInnerHTML={{ __html: expr.latex }}
							/>
						</div>
					</div>
				</Draggable>
			))}

			{/* Welcome/Guide Overlay */}
			{showWelcome && latexExpression.length === 0 && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
					<div className="bg-background border-2 border-foreground w-96 max-w-full">
						<div className="bg-foreground text-background p-2 font-bold flex items-center justify-between">
							<span>WELCOME TO DOODLE</span>
							<button onClick={() => setShowWelcome(false)}>
								<X className="h-4 w-4" />
							</button>
						</div>
						<div className="p-6">
							<div className="h-16 w-16 bg-foreground flex items-center justify-center mx-auto mb-6">
								<Sparkles className="h-8 w-8 text-background" />
							</div>
							<h2 className="text-xl font-bold mb-4 uppercase text-center">
								Draw to Calculate
							</h2>
							<p className="text-muted-foreground mb-6">
								Write any mathematical expression on the canvas
								with your selected color and press CALCULATE to
								solve it instantly.
							</p>
							<Button
								onClick={() => setShowWelcome(false)}
								className="w-full bg-foreground text-background hover:bg-foreground/90"
							>
								GET STARTED
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Loading State Overlay */}
			{calcStatus === "calculating" && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm pointer-events-none z-50">
					<div className="bg-background border-2 border-foreground p-4 flex items-center gap-4">
						<div className="h-7 w-7 border-2 border-l-transparent border-foreground animate-spin"></div>
						<div className="font-bold">
							PROCESSING EXPRESSION...
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
