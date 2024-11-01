import type { Metadata } from "next";
import "./globals.css";
import { GeistMono } from "geist/font/mono";

export const metadata: Metadata = {
	title: "Doodle",
	description: "A Simple AI Calculator",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${GeistMono.variable} font-mono  antialiased`}>
				{children}
			</body>
		</html>
	);
}
