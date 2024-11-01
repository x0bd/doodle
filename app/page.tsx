"use client";

import React, { useEffect, useRef, useState } from "react";
import { SWATCHES } from "@/constants";
import { ColorSwatch, Group } from "@mantine/core";
import { Button } from "@/components/ui/button";
import axios from "axios";

interface Response {
	expr: string;
	result: string;
	assign: boolean;
}

interface GeneratedResult {
	expression: string;
	answer: string;
}

export default function Home() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [color, setColor] = useState("rgb(255, 255, 255)");
	const [reset, setReset] = useState(false);
	const [result, setResult] = useState<GeneratedResult>();
	const [dictOfVars, setDictOfVars] = useState({});

	useEffect(() => {
		if (reset) {
			resetCanvas();
			setReset(false);
		}
	}, [reset]);

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
	}, []);

	const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (canvas) {
			canvas.style.background = "black";
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.beginPath();
				ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
				setIsDrawing(true);
			}
		}
	};

	const stopDrawing = () => {
		setIsDrawing(false);
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

	const sendData = async () => {
		const canvas = canvasRef.current;

		// Needs Further Work Here!!!!
		if (canvas) {
			const response = await axios({
				method: "post",
				url: "",
				data: {
					image: canvas.toDataURL("image/png"),
					dict_of_vars: dictOfVars,
				},
			});
			const resp = await response.data;
			console.log("Response");
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

	return (
		<>
			<canvas
				ref={canvasRef}
				id="canvas"
				className="absolute top-0 left-0 w-full h-full"
				onMouseDown={startDrawing}
				onMouseOut={stopDrawing}
				onMouseUp={stopDrawing}
				onMouseMove={draw}
			/>
		</>
	);
}
