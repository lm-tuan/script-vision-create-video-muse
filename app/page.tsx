"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/Tabs";
import { useScriptVisionState } from "@/hooks/useScriptVisionState";
import { logService } from "@/lib/logger";

// Modular tab components
import { ScriptEditor } from "@/components/pipeline/ScriptEditor";
import { TranscriptView } from "@/components/pipeline/TranscriptView";
import { VideoShotsPanel } from "@/components/pipeline/VideoShotsPanel";
import { TtsGenerator } from "@/components/pipeline/TtsGenerator";
import { VideoComposer } from "@/components/pipeline/VideoComposer";
import { YoutubeSeoTab } from "@/components/pipeline/YoutubeSeoTab";
import { Logger } from "@/components/pipeline/Logger";

// Lucide Icons
import {
    Sparkles,
    Clock,
    Download,
    Play,
    Activity,
    Cpu,
    CheckCircle2,
    AlertCircle,
    FileText,
    ExternalLink,
    FolderOpen,
    Copy,
    Trash2,
    Youtube,
    Archive,
    Music,
    Subtitles,
    LayoutList,
    MessageSquareText
} from "lucide-react";

export default function Home() {
    const state = useScriptVisionState();

    const hasAudio = !!state.generatedAudioUrl || !!state.localAudioFile;
    const hasSrt = !!state.generatedSrtUrl || !!state.localSrtFile;
    const hasFinalPrompt = state.finalPrompts.length > 0;
    const hasDuration = state.durations.length > 0;
    const listToComposeForCheck = state.finalPrompts.length > 0 ? state.finalPrompts : state.durations;
    // Updated mapping check: Scene is mapped if either local file is uploaded OR server url is generated
    const allImagesMapped = listToComposeForCheck.length > 0 && listToComposeForCheck.every(d => !!state.sceneFiles[d.sceneNumber]);
    const isComposeDisabled = !hasAudio || !hasSrt || !allImagesMapped || !hasFinalPrompt || !hasDuration;

    const copyFolderPath = () => {
        navigator.clipboard.writeText(`file:///${state.masterStorageFolder.replace(/\\/g, '/')}`);
        logService.addLog("[Storage] Đã sao chép đường dẫn URL thư mục vào Clipboard.");
    };

    return (
        <div className="min-h-screen bg-background text-foreground py-10 px-4 md:px-8">
            <div className="mx-auto w-full max-w-[98%]">
                {/* Header Section */}
                <div className="mb-10 text-center relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/20 rounded-full blur-3xl -z-10" />
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary-foreground text-xs font-semibold mb-3 tracking-wide backdrop-blur-sm">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        AI Pipeline Engine
                    </div>
                </div>

                {/* Main Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* Left Column: Editor & Workflow Tabs (Col-span 8) */}
                    <div className="lg:col-span-8 space-y-6">
                        <div className="glass-card rounded-2xl p-6 shadow-xl relative overflow-hidden">
                            {/* Decorative line */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                            <Tabs value={state.activeTab} onValueChange={state.setActiveTab}>
                                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-4 mb-6 gap-4 flex-wrap">
                                    <TabsList className="h-auto flex-wrap justify-start bg-slate-900/60 p-1 border border-white/5">
                                        <TabsTrigger value="content" className="flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all">
                                            <FileText className="h-4 w-4" />
                                            Đầu vào
                                        </TabsTrigger>
                                        <TabsTrigger value="transcript" className="flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all">
                                            <Sparkles className="h-4 w-4" />
                                            Transcript
                                        </TabsTrigger>
                                        <TabsTrigger value="video-shots" className="gap-1.5 px-4 py-2 text-xs md:text-sm">
                                            <Clock className="h-4 w-4" />
                                            Shot video
                                        </TabsTrigger>
                                        <TabsTrigger value="compose" className="flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all">
                                            <Play className="h-4 w-4" />
                                            Dựng Video
                                        </TabsTrigger>
                                        <TabsTrigger value="youtube-seo" className="flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all">
                                            <Youtube className="h-4 w-4 text-red-500" />
                                            YouTube SEO
                                        </TabsTrigger>
                                    </TabsList>

                                    {/* Download Trigger */}
                                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                                        {state.activeTab === "transcript" && state.transcript && (
                                            <>
                                                <Button variant="outline" size="sm" onClick={state.downloadTranscript} className="h-9 gap-1.5 border-white/10 hover:bg-white/5 text-xs">
                                                    <Download className="h-3.5 w-3.5" />
                                                    Tải Script
                                                </Button>
                                                {state.srtContent && (
                                                    <Button variant="outline" size="sm" onClick={state.downloadSrt} className="h-9 gap-1.5 border-white/10 hover:bg-white/5 text-xs">
                                                        <Download className="h-3.5 w-3.5" />
                                                        Tải SRT
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* TAB 1: CONTENT INPUT */}
                                <TabsContent value="content">
                                    <ScriptEditor
                                        content={state.content}
                                        setContent={state.setContent}
                                        rewriteWithAi={state.rewriteWithAi}
                                        setRewriteWithAi={state.setRewriteWithAi}
                                        keepOrExpandDuration={state.keepOrExpandDuration}
                                        setKeepOrExpandDuration={state.setKeepOrExpandDuration}
                                        loading={state.loading}
                                        handleGenerateTranscript={state.handleGenerateTranscript}
                                        handleFileUpload={state.handleFileUpload}
                                        language={state.language}
                                        setLanguage={state.setLanguage}
                                    />
                                </TabsContent>

                                {/* TAB 2: TRANSCRIPT & TTS */}
                                <TabsContent value="transcript">
                                    <TranscriptView
                                        transcript={state.transcript}
                                        setTranscript={state.setTranscript}
                                        srtContent={state.srtContent}
                                        setSrtContent={state.setSrtContent}
                                        handleSrtUpload={state.handleSrtUpload}
                                        loading={state.loading}
                                        language={state.language}
                                    />
                                    <div className="mt-6">
                                        <TtsGenerator
                                            transcript={state.transcript}
                                            ttsEngine={state.ttsEngine}
                                            setTtsEngine={state.setTtsEngine}
                                            ttsVoice={state.ttsVoice}
                                            setTtsVoice={state.setTtsVoice}
                                            genmaxApiKey={state.genmaxApiKey}
                                            setGenmaxApiKey={state.setGenmaxApiKey}
                                            genmaxProvider={state.genmaxProvider}
                                            setGenmaxProvider={state.setGenmaxProvider}
                                            genmaxVoiceId={state.genmaxVoiceId}
                                            setGenmaxVoiceId={state.setGenmaxVoiceId}
                                            genmaxModelId={state.genmaxModelId}
                                            setGenmaxModelId={state.setGenmaxModelId}
                                            beeknoeeApiKey={state.beeknoeeApiKey}
                                            setBeeknoeeApiKey={state.saveBeeknoeeApiKey}
                                            beeknoeeModel={state.beeknoeeModel}
                                            setBeeknoeeModel={state.saveBeeknoeeModel}
                                            beeknoeeVoice={state.beeknoeeVoice}
                                            setBeeknoeeVoice={state.saveBeeknoeeVoice}
                                            favoriteVoices={state.favoriteVoices}
                                            newFavName={state.newFavName}
                                            setNewFavName={state.setNewFavName}
                                            generatedAudioUrl={state.generatedAudioUrl}
                                            ttsLoading={state.ttsLoading}
                                            ttsProgress={state.ttsProgress}
                                            ttsStatus={state.ttsStatus}
                                            ttsError={state.ttsError}
                                            language={state.language}
                                            setLanguage={state.setLanguage}
                                            addFavoriteVoice={state.addFavoriteVoice}
                                            deleteFavoriteVoice={state.deleteFavoriteVoice}
                                            handleGenerateTTS={state.handleGenerateTTS}
                                            getTimestampString={state.getTimestampString}
                                            loading={state.loading}
                                        />
                                    </div>
                                </TabsContent>



                                <div hidden={state.activeTab !== "video-shots"}>
                                    <VideoShotsPanel audioUrl={state.generatedAudioUrl} srt={state.srtContent} onApply={state.handleApplyVideoShots} />
                                </div>


                                {/* TAB 6: COMPOSE VIDEO */}
                                <TabsContent value="compose">
                                    <VideoComposer
                                        durations={state.durations}
                                        finalPrompts={state.finalPrompts}
                                        sceneFiles={state.sceneFiles}
                                        storyboardCues={state.storyboardCues}
                                        setStoryboardCues={state.setStoryboardCues}
                                        language={state.language}
                                        generatedAudioUrl={state.generatedAudioUrl}
                                        setGeneratedAudioUrl={state.setGeneratedAudioUrl}
                                        generatedSrtUrl={state.generatedSrtUrl}
                                        setGeneratedSrtUrl={state.setGeneratedSrtUrl}
                                        localAudioFile={state.localAudioFile}
                                        setLocalAudioFile={state.setLocalAudioFile}
                                        localSrtFile={state.localSrtFile}
                                        setLocalSrtFile={state.setLocalSrtFile}
                                        burnSubtitles={state.burnSubtitles}
                                        setBurnSubtitles={state.setBurnSubtitles}
                                        audioLeadTime={state.audioLeadTime}
                                        setAudioLeadTime={state.setAudioLeadTime}
                                        useAdvancedRender={state.useAdvancedRender}
                                        setUseAdvancedRender={state.setUseAdvancedRender}
                                        transitionType={state.transitionType}
                                        setTransitionType={state.setTransitionType}
                                        transitionDuration={state.transitionDuration}
                                        setTransitionDuration={state.setTransitionDuration}
                                        colorPreset={state.colorPreset}
                                        setColorPreset={state.setColorPreset}
                                        showSceneTitle={state.showSceneTitle}
                                        setShowSceneTitle={state.setShowSceneTitle}
                                        bgmFile={state.bgmFile}
                                        setBgmFile={state.setBgmFile}
                                        bgmVolume={state.bgmVolume}
                                        setBgmVolume={state.setBgmVolume}
                                        showIntro={state.showIntro}
                                        setShowIntro={state.setShowIntro}
                                        introTitle={state.introTitle}
                                        setIntroTitle={state.setIntroTitle}
                                        introSubtitle={state.introSubtitle}
                                        setIntroSubtitle={state.setIntroSubtitle}
                                        showOutro={state.showOutro}
                                        setShowOutro={state.setShowOutro}
                                        outroText={state.outroText}
                                        setOutroText={state.setOutroText}
                                        vignette={state.vignette}
                                        setVignette={state.setVignette}
                                        filmGrain={state.filmGrain}
                                        setFilmGrain={state.setFilmGrain}
                                        subtitleStyle={state.subtitleStyle}
                                        setSubtitleStyle={state.setSubtitleStyle}
                                        showProgressBar={state.showProgressBar}
                                        setShowProgressBar={state.setShowProgressBar}
                                        composeLoading={state.composeLoading}
                                        composeProgress={state.composeProgress}
                                        composeStatus={state.composeStatus}
                                        composedVideoUrl={state.composedVideoUrl}
                                        handleImportDurations={state.handleImportDurations}
                                        handleImportFinalPrompt={state.handleImportFinalPrompt}
                                        handleBatchAutoMap={state.handleBatchAutoMap}
                                        handleUploadSceneFile={state.handleUploadSceneFile}
                                        handleComposeVideo={state.handleComposeVideo}
                                        handleDownloadAllZip={state.handleDownloadAllZip}
                                        getTimestampString={state.getTimestampString}
                                    />
                                </TabsContent>

                                {/* TAB 7: YOUTUBE SEO & THUMBNAIL */}
                                <TabsContent value="youtube-seo">
                                    <YoutubeSeoTab
                                        seoLanguage={state.seoLanguage}
                                        setSeoLanguage={state.setSeoLanguage}
                                        seoData={state.seoData}
                                        seoLoading={state.seoLoading}
                                        thumbnailPrompt={state.thumbnailPrompt}
                                        setThumbnailPrompt={state.setThumbnailPrompt}
                                        handleGenerateSeo={state.handleGenerateSeo}
                                        transcript={state.transcript}
                                        content={state.content}
                                        durations={state.durations}
                                    />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </div>

                    {/* Right Column: Execution Console, Settings, Status Panel (Col-span 4) */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Settings Glass Panel */}
                        <div className="glass-card rounded-2xl p-5 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
                                <Cpu className="h-4 w-4 text-primary" />
                                Cấu hình hệ thống
                            </h2>
                            <div className="space-y-4">
                                {/* Master Storage Folder Config */}
                                <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-slate-950/60 border border-primary/20 shadow-inner">
                                    <label className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center justify-between" htmlFor="master-storage-folder">
                                        <span>Nơi lưu trữ toàn bộ dự án</span>
                                        {state.autoSaveStatus ? (
                                            <span className="text-[10px] text-emerald-400 font-mono font-normal flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3 inline" /> {state.autoSaveStatus}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-slate-500 font-mono font-normal">Tự động ghi tệp</span>
                                        )}
                                    </label>

                                    <div className="flex flex-col gap-2">
                                        <div className="relative w-full flex items-center group">
                                            <input
                                                id="master-storage-folder"
                                                type="text"
                                                value={state.masterStorageFolder}
                                                onChange={(e) => state.setMasterStorageFolder(e.target.value)}
                                                placeholder="Đường dẫn thư mục lưu, ví dụ: E:\YOUTUBE\Output"
                                                className="h-9 w-full rounded-lg border border-white/10 bg-slate-950 pl-3 pr-8 text-xs text-emerald-400 font-mono font-medium focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={state.handleOpenTargetFolder}
                                                className="absolute right-2 p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                                                title="Mở thư mục này trong Windows File Explorer"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                onClick={state.handleSelectFolder}
                                                disabled={state.isFolderPicking}
                                                variant="outline"
                                                className="h-9 px-3 border border-primary/30 hover:border-primary bg-primary/10 hover:bg-primary/20 rounded-lg text-xs font-semibold text-primary transition-all shrink-0 flex items-center gap-1.5"
                                                title="Chọn thư mục lưu trữ trên máy"
                                            >
                                                {state.isFolderPicking ? (
                                                    <Activity className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <FolderOpen className="h-3.5 w-3.5" />
                                                )}
                                                Chọn thư mục
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={state.handleOpenTargetFolder}
                                                variant="outline"
                                                className="h-9 px-2.5 border border-emerald-500/30 hover:border-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-300 transition-all shrink-0 flex items-center gap-1.5"
                                                title="Mở trực tiếp thư mục này trong Explorer"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 text-emerald-400" />
                                                Mở thư mục
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={() => state.saveMasterStorageFolder("outputs")}
                                                variant="outline"
                                                className="h-9 px-2 text-[10px] text-slate-400 hover:text-slate-200 border border-white/10 hover:bg-white/5 rounded-lg shrink-0"
                                                title="Đặt về thư mục mặc định: outputs"
                                            >
                                                Mặc định
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Dedicated Path URL Display & Copy Bar */}
                                    {state.masterStorageFolder && state.masterStorageFolder !== 'outputs' && (
                                        <div className="flex items-center justify-between gap-2 p-2 px-3 rounded-lg bg-slate-900/90 border border-emerald-500/20 text-[11px] font-mono">
                                            <div className="flex items-center gap-1.5 overflow-hidden truncate">
                                                <span className="text-slate-400 shrink-0 font-sans text-[10px] font-bold uppercase tracking-wider">PATH:</span>
                                                <button
                                                    type="button"
                                                    onClick={state.handleOpenTargetFolder}
                                                    className="text-emerald-400 hover:text-emerald-300 hover:underline truncate font-medium text-left font-mono"
                                                    title="Click để mở trực tiếp trong Explorer"
                                                >
                                                    {state.masterStorageFolder}
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={copyFolderPath}
                                                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-350 hover:text-white shrink-0 flex items-center gap-1 text-[10px] font-sans transition-all border border-white/5"
                                                title="Sao chép đường dẫn"
                                            >
                                                <Copy className="h-3 w-3 text-emerald-450" />
                                                <span>Copy</span>
                                            </button>
                                        </div>
                                    )}

                                    <span className="text-[10px] text-slate-500 leading-tight">
                                        Chọn thư mục trên máy tính để tự động lưu toàn bộ tệp Script, SRT, Phân cảnh, Prompt & Ảnh vào đó.
                                    </span>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold text-slate-400">M? h?nh AI x? l? v?n b?n</span>
                                    <span className="text-sm">API local (Codex CLI)</span>
                                </div>

                                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/40 border border-white/5">
                                    <input
                                        id="longForm"
                                        type="checkbox"
                                        checked={state.longForm}
                                        onChange={(e) => state.setLongForm(e.target.checked)}
                                        className="mt-1 h-3.5 w-3.5 rounded border-white/20 bg-slate-900 text-primary focus:ring-primary/30"
                                    />
                                    <div className="flex flex-col">
                                        <label className="text-xs font-bold text-slate-300 cursor-pointer" htmlFor="longForm">
                                            Yêu cầu Video dài
                                        </label>
                                        <span className="text-[10px] text-slate-500 mt-0.5">
                                            Tối ưu cấu trúc phân cảnh dài 10 - 15 phút.
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Download All ZIP Panel */}
                        <div className="glass-card rounded-2xl p-5 shadow-xl relative overflow-hidden border border-violet-500/20">
                            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                                <Archive className="h-4 w-4 text-violet-400" />
                                Tải xuống dự án
                            </h2>

                            {/* Individual file status */}
                            <div className="grid grid-cols-2 gap-1.5 mb-3">
                                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold border ${
                                    state.transcript ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/5 bg-slate-950/40 text-slate-600'
                                }`}>
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate">Transcript</span>
                                    {state.transcript && <CheckCircle2 className="h-2.5 w-2.5 ml-auto shrink-0 text-emerald-400" />}
                                </div>
                                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold border ${
                                    state.srtContent ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/5 bg-slate-950/40 text-slate-600'
                                }`}>
                                    <Subtitles className="h-3 w-3 shrink-0" />
                                    <span className="truncate">Phụ đề SRT</span>
                                    {state.srtContent && <CheckCircle2 className="h-2.5 w-2.5 ml-auto shrink-0 text-emerald-400" />}
                                </div>
                                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold border ${
                                    state.durations.length > 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/5 bg-slate-950/40 text-slate-600'
                                }`}>
                                    <LayoutList className="h-3 w-3 shrink-0" />
                                    <span className="truncate">Phân cảnh</span>
                                    {state.durations.length > 0 && <CheckCircle2 className="h-2.5 w-2.5 ml-auto shrink-0 text-emerald-400" />}
                                </div>
                                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold border ${
                                    state.prompts ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/5 bg-slate-950/40 text-slate-600'
                                }`}>
                                    <MessageSquareText className="h-3 w-3 shrink-0" />
                                    <span className="truncate">Prompts</span>
                                    {state.prompts && <CheckCircle2 className="h-2.5 w-2.5 ml-auto shrink-0 text-emerald-400" />}
                                </div>
                                <div className={`col-span-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold border ${
                                    (state.generatedAudioUrl || state.localAudioFile) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/5 bg-slate-950/40 text-slate-600'
                                }`}>
                                    <Music className="h-3 w-3 shrink-0" />
                                    <span className="truncate">Audio (đính kèm khi có URL server)</span>
                                    {(state.generatedAudioUrl || state.localAudioFile) && <CheckCircle2 className="h-2.5 w-2.5 ml-auto shrink-0 text-emerald-400" />}
                                </div>
                            </div>

                            {/* Divider + individual quick downloads */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {state.transcript && (
                                    <button onClick={state.downloadTranscript}
                                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/15 text-[10px] text-slate-300 hover:text-white transition-all">
                                        <Download className="h-2.5 w-2.5" /> .txt
                                    </button>
                                )}
                                {state.srtContent && (
                                    <button onClick={state.downloadSrt}
                                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/15 text-[10px] text-slate-300 hover:text-white transition-all">
                                        <Download className="h-2.5 w-2.5" /> .srt
                                    </button>
                                )}
                                {state.durations.length > 0 && (
                                    <button onClick={state.downloadDurations}
                                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/15 text-[10px] text-slate-300 hover:text-white transition-all">
                                        <Download className="h-2.5 w-2.5" /> cảnh
                                    </button>
                                )}
                                {state.prompts && (
                                    <button onClick={state.downloadPrompts}
                                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/15 text-[10px] text-slate-300 hover:text-white transition-all">
                                        <Download className="h-2.5 w-2.5" /> prompts
                                    </button>
                                )}
                            </div>

                            {/* Project Name Input + ZIP button */}
                            <div className="flex flex-col gap-2 mt-1">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider" htmlFor="project-name-input">
                                        Tên dự án (tên file ZIP)
                                    </label>
                                    <input
                                        id="project-name-input"
                                        type="text"
                                        value={state.projectName}
                                        onChange={(e) => state.setProjectName(e.target.value)}
                                        placeholder="Ví dụ: Video_Du_Lich_Nhat_Ban"
                                        className="h-9 w-full rounded-lg border border-violet-500/20 bg-slate-950 px-3 text-xs text-violet-200 font-mono focus:border-violet-400/50 focus:ring-1 focus:ring-violet-500/20 outline-none placeholder:text-slate-600"
                                    />
                                    <p className="text-[10px] text-slate-600 leading-tight">
                                        Tên này sẽ được dùng làm tên file <span className="text-violet-400/70 font-mono">.zip</span> khi tải xuống.
                                    </p>
                                </div>
                                <Button
                                    id="btn-download-all-zip"
                                    onClick={state.handleDownloadAllZip}
                                    disabled={!state.transcript && !state.srtContent && state.durations.length === 0 && !state.prompts}
                                    className="w-full h-10 gap-2 text-sm font-bold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed border-0 shadow-lg shadow-violet-900/30 transition-all duration-200 active:scale-95"
                                >
                                    <Archive className="h-4 w-4" />
                                    Tải tất cả ZIP 1 lần
                                </Button>
                                <p className="text-[10px] text-slate-500 text-center leading-tight">
                                    Đóng gói transcript, SRT, phân cảnh, prompts &amp; audio vào 1 file <span className="text-violet-400/70 font-mono">{state.projectName.trim() ? `${state.projectName.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}.zip` : 'project_export_*.zip'}</span>
                                </p>
                            </div>
                        </div>

                        {/* Logs Terminal Panel */}
                        <Logger />

                        {/* Execution Status Panel */}
                        {(state.status || state.progress > 0 || state.error) && (
                            <div className="glass-card rounded-2xl p-5 shadow-xl relative overflow-hidden border-white/10 space-y-4">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <Activity className="h-4 w-4 text-primary" />
                                    Trạng thái xử lý
                                </h2>

                                {state.error && (
                                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-450 flex items-start gap-2 leading-relaxed">
                                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold">Lỗi: </span>
                                            {state.error}
                                        </div>
                                    </div>
                                )}

                                {state.status && !state.error && (
                                    <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-slate-200 flex items-start gap-2 leading-relaxed">
                                        <Activity className="h-4 w-4 shrink-0 mt-0.5 text-primary animate-spin" />
                                        <div>
                                            <span className="font-bold text-primary">Quy trình: </span>
                                            {state.status}
                                        </div>
                                    </div>
                                )}

                                {state.progress > 0 && state.progress <= 100 && !state.error && (
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex justify-between text-[11px] font-bold font-mono">
                                            <span className="text-slate-400">Tiến độ tổng quát</span>
                                            <span className="text-primary">{state.progress}%</span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-slate-900 border border-white/5 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-400 shadow-md shadow-primary/30 transition-all duration-500"
                                                style={{ width: `${state.progress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
