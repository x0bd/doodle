"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";

interface GeneratedResult {
	expression: string;
	answer: string;
}

interface Response {
	expr: string;
	result: string;
	assign: boolean;
}

// Define color swatches
const SWATCHES = [
	"rgb(255, 255, 255)",
	"rgb(255, 0, 0)",
	"rgb(0, 255, 0)",
	"rgb(0, 0, 255)",
	"rgb(255, 255, 0)",
	"rgb(255, 0, 255)",
	"rgb(0, 255, 255)",
];

interface ColorSwatchProps {
	color: string;
	selected?: boolean;
	onClick: () => void;
}

/
const ColorSwatch: React.FC<ColorSwatchProps> = ({
	color,
	selected,
	onClick,
}) => {
	return (
		<button
			className={cn(
				"w-8 h-8 rounded-full transition-all border-2",
				selected ? "border-gray-300" : "border-transparent"
			)}
			style={{ backgroundColor: color }}
			onClick={onClick}
			type="button"
			aria-label={`Select ${color} color`}
		/>
	);
};

interface ColorSwatchesProps {
	value: string;
	onChange: (color: string) => void;
}

// Custom ColorSwatches component
const ColorSwatches: React.FC<ColorSwatchesProps> = ({ value, onChange }) => {
	return (
		<div className="flex flex-wrap gap-2 items-center justify-center">
			{SWATCHES.map((swatch) => (
				<ColorSwatch
					key={swatch}
					color={swatch}
					selected={value === swatch}
					onClick={() => onChange(swatch)}
				/>
			))}
		</div>
	);
};

// Draggable component to replace react-draggable
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
	const [color, setColor] = useState(SWATCHES[0]);
	const [dictOfVars, setDictOfVars] = useState<Record<string, string>>({});
	const [result, setResult] = useState<GeneratedResult | undefined>();
	const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });
	const [latexExpression, setLatexExpression] = useState<Array<string>>([]);

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
				canvas.style.background = "black";
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
			// Mock response for now (removing axios dependency)
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

	return (
		<div className="relative min-h-screen">
			<div className="absolute top-4 left-0 right-0 z-30 px-4">
				<Card className="bg-black/80 backdrop-blur-sm border-gray-800">
					<CardContent className="p-4">
						<div className="grid grid-cols-3 gap-2">
							<Button
								onClick={handleReset}
								variant="secondary"
								className="w-full"
							>
								Reset
							</Button>
							<div className="flex justify-center">
								<ColorSwatches
									value={color}
									onChange={setColor}
								/>
							</div>
							<Button
								onClick={runCalculation}
								variant="default"
								className="w-full"
							>
								Calculate
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			<canvas
				ref={canvasRef}
				id="canvas"
				className="absolute top-0 left-0 w-full h-full"
				onMouseDown={startDrawing}
				onMouseMove={draw}
				onMouseUp={stopDrawing}
				onMouseOut={stopDrawing}
			/>

			{latexExpression.map((latex, index) => (
				<Draggable
					key={index}
					defaultPosition={latexPosition}
					onStop={(position) => setLatexPosition(position)}
				>
					<Card className="bg-black/80 p-2 text-white shadow-lg border-gray-700">
						<div
							className="latex-content"
							dangerouslySetInnerHTML={{ __html: latex }}
						/>
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
