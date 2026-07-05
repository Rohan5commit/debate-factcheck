"use client";

import { useState, useRef } from "react";
import { useFactCheck } from "@/hooks/use-fact-check";
import { FactCheckCard } from "./fact-check-card";

export function PrepMode() {
  const [inputText, setInputText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { results, isChecking, error, checkPrep, retryLast } = useFactCheck();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadedFile(file);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setInputText(data.text);
    } catch {
      alert("Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCheck = () => {
    if (inputText.trim()) {
      checkPrep(inputText);
    }
  };

  const handleClear = () => {
    setInputText("");
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const correctCount = results.filter((r) => r.status === "correct").length;
  const incorrectCount = results.filter((r) => r.status === "incorrect").length;
  const misleadingCount = results.filter((r) => r.status === "misleading").length;
  const unverifiableCount = results.filter((r) => r.status === "unverifiable").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors disabled:opacity-50"
        >
          {isUploading ? "Uploading..." : "Upload File"}
        </button>
        {uploadedFile && (
          <span className="text-sm text-gray-600 truncate max-w-[200px]">
            {uploadedFile.name}
          </span>
        )}
      </div>

      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Paste your notes, debate prep, or claims here..."
        className="w-full h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleCheck}
          disabled={!inputText.trim() || isChecking}
          className="px-4 py-2 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {isChecking ? "Checking..." : "Check Facts"}
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>
        {isChecking && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Processing...
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <div className="flex items-start justify-between">
            <span>{error}</span>
            <button
              onClick={retryLast}
              className="text-xs underline hover:no-underline ml-2"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            {correctCount} correct
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-yellow-500 rounded-full" />
            {misleadingCount} misleading
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            {incorrectCount} incorrect
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-gray-400 rounded-full" />
            {unverifiableCount} unverifiable
          </span>
        </div>
      )}

      <div className="space-y-3">
        {results.map((result) => (
          <FactCheckCard key={result.id} result={result} />
        ))}
      </div>
    </div>
  );
}
