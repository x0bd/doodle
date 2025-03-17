"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "lucide-react";

interface GeneratedResult {
	expression: string;
	answer: string;
}

interface Response {
	expr: string;
	result: string;
	assign: boolean;
}

// Define refined color palette
const COLORS = [
	{ name: "White", value: "#FFFFFF" },
	{ name: "Black", value: "#000000" },
	{ name: "Blue", value: "#0070F3" }, // Vercel blue
	{ name: "Cyan", value: "#50E3C2" },
	{ name: "Red", value: "#FF0000" },
	{ name: "Green", value: "#00FF00" },
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
				"w-6 h-6 rounded-full transition-all",
				selected
					? "ring-2 ring-white ring-offset-2 ring-offset-black scale-125"
					: "opacity-80 hover:opacity-100"
			)}
			style={{ backgroundColor: color.value }}
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
		<div className="flex gap-3 items-center justify-center py-2">
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

// Floating Navbar component
const FloatingNavbar: React.FC = () => {
	const { theme, setTheme } = useTheme();

	return (
		<div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
			<div className="flex items-center px-6 py-2 rounded-full bg-black/30 backdrop-blur-md border border-white/10 shadow-lg">
				<h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mr-6">
					Doodle
				</h1>
				<button
					onClick={() =>
						setTheme(theme === "dark" ? "light" : "dark")
					}
					className="p-2 rounded-full hover:bg-white/10 transition-colors"
					aria-label="Toggle theme"
				>
					{theme === "dark" ? (
						<SunIcon className="h-5 w-5 text-yellow-300" />
					) : (
						<MoonIcon className="h-5 w-5 text-blue-300" />
					)}
				</button>
			</div>
		</div>
	);
};

// Draggable component
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
		>
			<div className="flex items-center gap-1">
				<DragHandleDots2Icon className="h-4 w-4 text-gray-400" />
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
				ctx.lineWidth = 3;
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
							["\\(", "\\)"],
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
					ctx.lineWidth = 3;
				}
			}
		};

		window.addEventListener("resize", handleResize);

		return () => {
			document.head.removeChild(script);
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	const renderLatexToCanvas = (expression: string, answer: string) => {
		const latex = `\\(\\LARGE{${expression} = ${answer}}\\)`;
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
			// Mock response for now
			const mockResponse = {
				data: [
					{
						expr: "2 + 2",
						result: "4",
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
				mockResponse.data.forEach((data: Response) => {
					setTimeout(() => {
						setResult({
							expression: data.expr,
							answer: data.result,
						});
					}, 1000);
				});
			}
		}
	};

	const bgClass = theme === "dark" ? "bg-black" : "bg-gray-100";

	return (
		<div className={`relative min-h-screen ${bgClass}`}>
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

			{/* Floating Action Buttons */}
			<div className="absolute top-4 right-4 flex gap-2">
				<Button
					onClick={handleReset}
					variant="outline"
					className="h-8 rounded-full border border-white/20 bg-black/40 backdrop-blur-md text-xs text-white hover:bg-black/60"
				>
					Reset
				</Button>

				<Button
					onClick={runCalculation}
					className="h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-xs border-0"
				>
					Calculate
				</Button>
			</div>

			{/* Enhanced macOS Dock-style Color Palette */}
			<div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
				<Card className="bg-black/30 backdrop-blur-lg border border-white/20 px-4 py-2 rounded-full shadow-2xl">
					<ColorSwatches value={color} onChange={setColor} />
				</Card>
			</div>

			{/* LaTeX Results */}
			{latexExpression.map((latex, index) => (
				<Draggable
					key={index}
					defaultPosition={latexPosition}
					onStop={(position) => setLatexPosition(position)}
				>
					<Card className="bg-black/40 backdrop-blur-md border border-white/10 rounded-md shadow-xl text-white">
						<div className="p-3">
							<div
								className="latex-content"
								dangerouslySetInnerHTML={{ __html: latex }}
							/>
						</div>
					</Card>
				</Draggable>
			))}
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
