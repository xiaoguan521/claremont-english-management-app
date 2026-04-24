import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { useAuth } from "../lib/auth";
import {
  getSchoolAiConfig,
  getSchoolSpeechConfig,
  type SchoolAiConfigSummary,
  type SchoolSpeechConfigSummary,
  upsertSchoolAiConfig,
  upsertSchoolSpeechConfig,
} from "../lib/admin";
import { supabase } from "../lib/supabase";

type SchoolRecord = {
  id: string;
  name: string;
  code: string;
  timezone: string;
};

type SchoolBrandConfigRecord = {
  school_id: string;
  slug: string;
  app_display_name: string;
  welcome_title: string;
  welcome_message: string;
  theme_key: string;
  brand_name: string;
  logo_url: string;
  updated_at: string | null;
};

type SchoolBrandFormState = {
  brandName: string;
  logoUrl: string;
};

type AiConfigFormState = {
  providerType: string;
  providerLabel: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
};

type SpeechConfigFormState = {
  providerType: string;
  providerLabel: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  voicePreset: string;
  responseFormat: string;
  enabled: boolean;
};

type LogoEditorState = {
  previewUrl: string;
  width: number;
  height: number;
  mimeType: string;
};

const schoolBrandingBucket = "school-branding";
const maxLogoFileSize = 2 * 1024 * 1024;
const allowedLogoMimeTypes = ["image/png", "image/jpeg", "image/webp"];
const logoCropViewportSize = 280;
const logoOutputSize = 512;

const providerOptions = [
  { value: "openai_compatible", label: "OpenAI 兼容接口" },
  { value: "anthropic", label: "Anthropic 官方接口" },
  { value: "gemini", label: "Gemini 官方接口" },
  { value: "custom", label: "完全自定义" },
];

function defaultLabelForProvider(providerType: string) {
  const option = providerOptions.find((item) => item.value === providerType);
  return option?.label ?? "自定义 AI";
}

function inferLogoExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function extractManagedLogoObjectPath(logoUrl: string) {
  const trimmed = logoUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const marker = `/storage/v1/object/public/${schoolBrandingBucket}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

async function loadImageDimensions(imageUrl: string) {
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片读取失败，请换一张图片重试。"));
    image.src = imageUrl;
  });

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

async function cropLogoToBlob({
  sourceUrl,
  width,
  height,
  zoom,
  offsetX,
  offsetY,
  mimeType,
}: {
  sourceUrl: string;
  width: number;
  height: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  mimeType: string;
}) {
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Logo 裁剪失败，请重新选择图片。"));
    image.src = sourceUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = logoOutputSize;
  canvas.height = logoOutputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器不支持图片裁剪，请稍后重试。");
  }

  const outputMimeType = mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  const coverScale = Math.max(logoOutputSize / width, logoOutputSize / height);

  if (outputMimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, logoOutputSize, logoOutputSize);
  } else {
    context.clearRect(0, 0, logoOutputSize, logoOutputSize);
  }

  context.save();
  context.translate(
    logoOutputSize / 2 + (offsetX / logoCropViewportSize) * logoOutputSize,
    logoOutputSize / 2 + (offsetY / logoCropViewportSize) * logoOutputSize,
  );
  context.scale(coverScale * zoom, coverScale * zoom);
  context.drawImage(image, -width / 2, -height / 2);
  context.restore();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputMimeType, 0.92);
  });

  if (!blob) {
    throw new Error("Logo 裁剪失败，请稍后重试。");
  }

  return { blob, mimeType: outputMimeType };
}

function createEmptyForm(): AiConfigFormState {
  return {
    providerType: "openai_compatible",
    providerLabel: defaultLabelForProvider("openai_compatible"),
    baseUrl: "",
    model: "",
    apiKey: "",
    enabled: true,
  };
}

function createEmptyBrandForm(): SchoolBrandFormState {
  return {
    brandName: "",
    logoUrl: "",
  };
}

function brandFormFromConfig(
  config: SchoolBrandConfigRecord | null,
): SchoolBrandFormState {
  if (!config) {
    return createEmptyBrandForm();
  }

  return {
    brandName: config.brand_name ?? "",
    logoUrl: config.logo_url ?? "",
  };
}

function formFromConfig(
  config: SchoolAiConfigSummary | null,
): AiConfigFormState {
  if (!config) {
    return createEmptyForm();
  }

  return {
    providerType: config.providerType,
    providerLabel: config.providerLabel,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: "",
    enabled: config.enabled,
  };
}

function createEmptySpeechForm(): SpeechConfigFormState {
  return {
    providerType: "openai_compatible",
    providerLabel: "语音模型",
    baseUrl: "",
    model: "",
    apiKey: "",
    voicePreset: "",
    responseFormat: "mp3",
    enabled: true,
  };
}

function formFromSpeechConfig(
  config: SchoolSpeechConfigSummary | null,
): SpeechConfigFormState {
  if (!config) {
    return createEmptySpeechForm();
  }

  return {
    providerType: config.providerType,
    providerLabel: config.providerLabel,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: "",
    voicePreset: config.voicePreset ?? "",
    responseFormat: config.responseFormat,
    enabled: config.enabled,
  };
}

export function SchoolPage() {
  const { memberships } = useAuth();
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [brandConfigLoading, setBrandConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoEditor, setLogoEditor] = useState<LogoEditorState | null>(null);
  const [logoCropZoom, setLogoCropZoom] = useState(1);
  const [logoCropOffsetX, setLogoCropOffsetX] = useState(0);
  const [logoCropOffsetY, setLogoCropOffsetY] = useState(0);
  const [brandConfig, setBrandConfig] =
    useState<SchoolBrandConfigRecord | null>(null);
  const [brandForm, setBrandForm] =
    useState<SchoolBrandFormState>(createEmptyBrandForm);
  const [config, setConfig] = useState<SchoolAiConfigSummary | null>(null);
  const [form, setForm] = useState<AiConfigFormState>(createEmptyForm);
  const [speechConfigLoading, setSpeechConfigLoading] = useState(false);
  const [speechSaving, setSpeechSaving] = useState(false);
  const [speechConfig, setSpeechConfig] =
    useState<SchoolSpeechConfigSummary | null>(null);
  const [speechForm, setSpeechForm] = useState<SpeechConfigFormState>(
    createEmptySpeechForm,
  );
  const [brandError, setBrandError] = useState<string | null>(null);
  const [brandSuccess, setBrandSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSuccess, setSpeechSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadSchools = async () => {
      setLoading(true);
      const schoolIds = Array.from(
        new Set(memberships.map((item) => item.school_id)),
      );
      if (schoolIds.length === 0) {
        setSchools([]);
        setSelectedSchoolId(null);
        setLoading(false);
        return;
      }

      const { data, error: schoolError } = await supabase
        .from("schools")
        .select("id, name, code, timezone")
        .in("id", schoolIds)
        .order("name");

      if (schoolError) {
        console.error(schoolError);
        setError("校区资料加载失败，请稍后重试。");
        setLoading(false);
        return;
      }

      const nextSchools = (data ?? []) as SchoolRecord[];
      setSchools(nextSchools);
      setSelectedSchoolId((current) => {
        if (current && nextSchools.some((school) => school.id === current)) {
          return current;
        }
        return nextSchools[0]?.id ?? null;
      });
      setLoading(false);
    };

    void loadSchools();
  }, [memberships]);

  useEffect(() => {
    if (!selectedSchoolId) {
      setBrandConfig(null);
      setBrandForm(createEmptyBrandForm());
      setConfig(null);
      setForm(createEmptyForm());
      setSpeechConfig(null);
      setSpeechForm(createEmptySpeechForm());
      setLogoEditor(null);
      return;
    }

    const loadConfig = async () => {
      setBrandConfigLoading(true);
      setConfigLoading(true);
      setSpeechConfigLoading(true);
      setBrandError(null);
      setBrandSuccess(null);
      setError(null);
      setSuccess(null);
      setSpeechError(null);
      setSpeechSuccess(null);
      try {
        const [brandResult, aiResult, speechResult] = await Promise.allSettled([
          supabase
            .from("school_configs")
            .select(
              "school_id, slug, app_display_name, welcome_title, welcome_message, theme_key, brand_name, logo_url, updated_at",
            )
            .eq("school_id", selectedSchoolId)
            .maybeSingle(),
          getSchoolAiConfig(selectedSchoolId),
          getSchoolSpeechConfig(selectedSchoolId),
        ]);

        if (brandResult.status === "fulfilled" && !brandResult.value.error) {
          const nextBrandConfig = (brandResult.value.data ??
            null) as SchoolBrandConfigRecord | null;
          setBrandConfig(nextBrandConfig);
          setBrandForm(brandFormFromConfig(nextBrandConfig));
        } else {
          const reason =
            brandResult.status === "fulfilled"
              ? brandResult.value.error
              : brandResult.reason;
          console.error(reason);
          setBrandError("品牌配置读取失败，请稍后重试。");
          setBrandConfig(null);
          setBrandForm(createEmptyBrandForm());
        }

        if (aiResult.status === "fulfilled") {
          setConfig(aiResult.value);
          setForm(formFromConfig(aiResult.value));
        } else {
          console.error(aiResult.reason);
          setError("AI 配置读取失败，请稍后重试。");
          setConfig(null);
          setForm(createEmptyForm());
        }

        if (speechResult.status === "fulfilled") {
          setSpeechConfig(speechResult.value);
          setSpeechForm(formFromSpeechConfig(speechResult.value));
        } else {
          console.error(speechResult.reason);
          setSpeechError("语音模型配置读取失败，请稍后重试。");
          setSpeechConfig(null);
          setSpeechForm(createEmptySpeechForm());
        }
      } catch (loadError) {
        console.error(loadError);
        setBrandError("品牌配置读取失败，请稍后重试。");
        setBrandConfig(null);
        setBrandForm(createEmptyBrandForm());
        setError("AI 配置读取失败，请稍后重试。");
        setConfig(null);
        setForm(createEmptyForm());
        setSpeechError("语音模型配置读取失败，请稍后重试。");
        setSpeechConfig(null);
        setSpeechForm(createEmptySpeechForm());
      } finally {
        setBrandConfigLoading(false);
        setConfigLoading(false);
        setSpeechConfigLoading(false);
      }
    };

    void loadConfig();
  }, [selectedSchoolId]);

  useEffect(() => {
    return () => {
      if (logoEditor?.previewUrl) {
        URL.revokeObjectURL(logoEditor.previewUrl);
      }
    };
  }, [logoEditor]);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const logoCropBounds = useMemo(() => {
    if (!logoEditor) {
      return { maxOffsetX: 0, maxOffsetY: 0 };
    }

    const baseScale = Math.max(
      logoCropViewportSize / logoEditor.width,
      logoCropViewportSize / logoEditor.height,
    );
    const renderedWidth = logoEditor.width * baseScale * logoCropZoom;
    const renderedHeight = logoEditor.height * baseScale * logoCropZoom;

    return {
      maxOffsetX: Math.max(
        0,
        Math.round((renderedWidth - logoCropViewportSize) / 2),
      ),
      maxOffsetY: Math.max(
        0,
        Math.round((renderedHeight - logoCropViewportSize) / 2),
      ),
    };
  }, [logoCropZoom, logoEditor]);

  const logoCropPreviewStyle = useMemo<CSSProperties>(() => {
    if (!logoEditor) {
      return {};
    }

    const baseScale = Math.max(
      logoCropViewportSize / logoEditor.width,
      logoCropViewportSize / logoEditor.height,
    );

    return {
      width: logoEditor.width * baseScale,
      height: logoEditor.height * baseScale,
      transform: `translate(calc(-50% + ${logoCropOffsetX}px), calc(-50% + ${logoCropOffsetY}px)) scale(${logoCropZoom})`,
    };
  }, [logoCropOffsetX, logoCropOffsetY, logoCropZoom, logoEditor]);

  useEffect(() => {
    setLogoCropOffsetX((current) =>
      Math.max(
        -logoCropBounds.maxOffsetX,
        Math.min(logoCropBounds.maxOffsetX, current),
      ),
    );
    setLogoCropOffsetY((current) =>
      Math.max(
        -logoCropBounds.maxOffsetY,
        Math.min(logoCropBounds.maxOffsetY, current),
      ),
    );
  }, [logoCropBounds.maxOffsetX, logoCropBounds.maxOffsetY]);

  const handleBrandSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSchoolId || !selectedSchool) {
      return;
    }

    setBrandSaving(true);
    setBrandError(null);
    setBrandSuccess(null);
    try {
      const nextBrandName = brandForm.brandName.trim();
      const nextLogoUrl = brandForm.logoUrl.trim();
      const payload = {
        school_id: selectedSchoolId,
        slug: brandConfig?.slug ?? selectedSchool.code,
        app_display_name: nextBrandName,
        welcome_title: nextBrandName
          ? `欢迎来到${nextBrandName}`
          : "欢迎使用学习入口",
        welcome_message: "今天也要认真完成英语学习任务。",
        theme_key: brandConfig?.theme_key ?? "forest",
        brand_name: nextBrandName,
        logo_url: nextLogoUrl,
      };

      const { data, error: saveError } = await supabase
        .from("school_configs")
        .upsert(payload, { onConflict: "school_id" })
        .select(
          "school_id, slug, app_display_name, welcome_title, welcome_message, theme_key, brand_name, logo_url, updated_at",
        )
        .single();

      if (saveError) {
        throw saveError;
      }

      const nextBrandConfig = data as SchoolBrandConfigRecord;
      setBrandConfig(nextBrandConfig);
      setBrandForm(brandFormFromConfig(nextBrandConfig));
      window.dispatchEvent(new Event("school-brand-updated"));
      setBrandSuccess(
        "机构品牌配置已保存，学生端、教师端和管理端会读取这里的名称与 logo。",
      );
    } catch (saveError) {
      console.error(saveError);
      setBrandError(
        saveError instanceof Error
          ? saveError.message
          : "保存失败，请稍后重试。",
      );
    } finally {
      setBrandSaving(false);
    }
  };

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    let previewUrl: string | null = null;

    if (!file || !selectedSchoolId) {
      return;
    }

    if (!allowedLogoMimeTypes.includes(file.type)) {
      setBrandError("请上传 PNG、JPG 或 WebP 格式的图片。");
      setBrandSuccess(null);
      return;
    }

    if (file.size > maxLogoFileSize) {
      setBrandError("Logo 文件不能超过 2MB。");
      setBrandSuccess(null);
      return;
    }

    setBrandError(null);
    setBrandSuccess(null);

    try {
      if (logoEditor?.previewUrl) {
        URL.revokeObjectURL(logoEditor.previewUrl);
      }

      previewUrl = URL.createObjectURL(file);
      const dimensions = await loadImageDimensions(previewUrl);
      setLogoEditor({
        previewUrl,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: file.type,
      });
      setLogoCropZoom(1);
      setLogoCropOffsetX(0);
      setLogoCropOffsetY(0);
    } catch (uploadError) {
      console.error(uploadError);
      setBrandError(
        uploadError instanceof Error
          ? uploadError.message
          : "Logo 上传失败，请稍后重试。",
      );
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    }
  };

  const handleConfirmLogoCrop = async () => {
    if (!logoEditor || !selectedSchoolId) {
      return;
    }

    setLogoUploading(true);
    setBrandError(null);
    setBrandSuccess(null);

    const previousManagedObjectPath = extractManagedLogoObjectPath(
      brandForm.logoUrl || brandConfig?.logo_url || "",
    );

    try {
      const { blob, mimeType } = await cropLogoToBlob({
        sourceUrl: logoEditor.previewUrl,
        width: logoEditor.width,
        height: logoEditor.height,
        zoom: logoCropZoom,
        offsetX: logoCropOffsetX,
        offsetY: logoCropOffsetY,
        mimeType: logoEditor.mimeType,
      });

      const objectPath = `${selectedSchoolId}/logo-${Date.now()}.${inferLogoExtension(
        new File([blob], "logo", { type: mimeType }),
      )}`;

      const { error: uploadError } = await supabase.storage
        .from(schoolBrandingBucket)
        .upload(objectPath, blob, {
          cacheControl: "3600",
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(schoolBrandingBucket).getPublicUrl(objectPath);

      if (
        previousManagedObjectPath &&
        previousManagedObjectPath !== objectPath
      ) {
        const { error: removeError } = await supabase.storage
          .from(schoolBrandingBucket)
          .remove([previousManagedObjectPath]);

        if (removeError) {
          console.error(removeError);
        }
      }

      setBrandForm((current) => ({
        ...current,
        logoUrl: publicUrl,
      }));
      setBrandSuccess(
        "Logo 已裁剪并上传，点击“保存应用品牌配置”后会同步到三端。",
      );
      URL.revokeObjectURL(logoEditor.previewUrl);
      setLogoEditor(null);
    } catch (uploadError) {
      console.error(uploadError);
      setBrandError(
        uploadError instanceof Error
          ? uploadError.message
          : "Logo 上传失败，请稍后重试。",
      );
    } finally {
      setLogoUploading(false);
    }
  };

  const handleCancelLogoCrop = () => {
    if (logoEditor?.previewUrl) {
      URL.revokeObjectURL(logoEditor.previewUrl);
    }
    setLogoEditor(null);
    setLogoCropZoom(1);
    setLogoCropOffsetX(0);
    setLogoCropOffsetY(0);
  };

  const handleClearLogo = async () => {
    if (!selectedSchoolId || !selectedSchool) {
      return;
    }

    setBrandSaving(true);
    setBrandError(null);
    setBrandSuccess(null);

    try {
      const managedObjectPath = extractManagedLogoObjectPath(
        brandForm.logoUrl || brandConfig?.logo_url || "",
      );

      if (managedObjectPath) {
        const { error: removeError } = await supabase.storage
          .from(schoolBrandingBucket)
          .remove([managedObjectPath]);

        if (removeError) {
          console.error(removeError);
        }
      }

      const nextBrandName = brandForm.brandName.trim();
      const payload = {
        school_id: selectedSchoolId,
        slug: brandConfig?.slug ?? selectedSchool.code,
        app_display_name: nextBrandName,
        welcome_title: nextBrandName
          ? `欢迎来到${nextBrandName}`
          : "欢迎使用学习入口",
        welcome_message: "今天也要认真完成英语学习任务。",
        theme_key: brandConfig?.theme_key ?? "forest",
        brand_name: nextBrandName,
        logo_url: "",
      };

      const { data, error: saveError } = await supabase
        .from("school_configs")
        .upsert(payload, { onConflict: "school_id" })
        .select(
          "school_id, slug, app_display_name, welcome_title, welcome_message, theme_key, brand_name, logo_url, updated_at",
        )
        .single();

      if (saveError) {
        throw saveError;
      }

      const nextBrandConfig = data as SchoolBrandConfigRecord;
      setBrandConfig(nextBrandConfig);
      setBrandForm(brandFormFromConfig(nextBrandConfig));
      window.dispatchEvent(new Event("school-brand-updated"));
      setBrandSuccess("当前 Logo 已清空，三端会回退到默认图标。");
    } catch (clearError) {
      console.error(clearError);
      setBrandError(
        clearError instanceof Error
          ? clearError.message
          : "Logo 清空失败，请稍后重试。",
      );
    } finally {
      setBrandSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSchoolId) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const nextConfig = await upsertSchoolAiConfig({
        schoolId: selectedSchoolId,
        providerType: form.providerType,
        providerLabel:
          form.providerLabel.trim() ||
          defaultLabelForProvider(form.providerType),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        apiKey: form.apiKey.trim() || undefined,
        enabled: form.enabled,
      });

      setConfig(nextConfig);
      setForm(formFromConfig(nextConfig));
      setSuccess(
        "AI 接入配置已保存，后续评测和生成能力可以按这个校区配置接入。",
      );
    } catch (saveError) {
      console.error(saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "保存失败，请稍后重试。",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSpeechSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSchoolId) {
      return;
    }

    setSpeechSaving(true);
    setSpeechError(null);
    setSpeechSuccess(null);
    try {
      const nextConfig = await upsertSchoolSpeechConfig({
        schoolId: selectedSchoolId,
        providerType: speechForm.providerType,
        providerLabel: speechForm.providerLabel.trim() || "语音模型",
        baseUrl: speechForm.baseUrl.trim(),
        model: speechForm.model.trim(),
        apiKey: speechForm.apiKey.trim() || undefined,
        voicePreset: speechForm.voicePreset.trim() || undefined,
        responseFormat: speechForm.responseFormat.trim() || "mp3",
        enabled: speechForm.enabled,
      });

      setSpeechConfig(nextConfig);
      setSpeechForm(formFromSpeechConfig(nextConfig));
      setSpeechSuccess(
        "语音模型配置已保存。学生端“听示范”会优先使用这个接口生成语音，失败时再回退到本地 TTS。",
      );
    } catch (saveError) {
      console.error(saveError);
      setSpeechError(
        saveError instanceof Error
          ? saveError.message
          : "保存失败，请稍后重试。",
      );
    } finally {
      setSpeechSaving(false);
    }
  };

  if (loading) {
    return <div className="screen-state">正在加载校区资料...</div>;
  }

  if (schools.length === 0) {
    return <div className="screen-state">当前账号还没有可管理的校区。</div>;
  }

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>校区资料与 AI 配置</h2>
          <p>
            每个校区都可以配置自己的 AI 服务商、Base
            URL、模型和密钥。后续语音评测、鼓励语和分析能力都会优先读取这里的配置。
          </p>
        </div>
        <div className="page-tag">School + AI</div>
      </header>

      <div className="school-config-layout">
        <section className="panel-card school-selector-card">
          <div className="panel-header">
            <h3>选择校区</h3>
            <p>先选择要管理的校区，再分别保存它们自己的 AI 接口配置。</p>
          </div>

          <div className="school-selection-list">
            {schools.map((school) => {
              const isActive = school.id === selectedSchoolId;
              return (
                <button
                  key={school.id}
                  type="button"
                  className={`school-selection-item ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedSchoolId(school.id)}
                >
                  <strong>{school.name}</strong>
                  <span>
                    {school.code} · {school.timezone}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedSchool ? (
            <div className="school-meta-card">
              <span className="status-pill active">当前校区</span>
              <strong>{selectedSchool.name}</strong>
              <p>
                校区编码：{selectedSchool.code}
                <br />
                时区：{selectedSchool.timezone}
              </p>
            </div>
          ) : null}
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <h3>应用品牌配置</h3>
            <p>
              这里的品牌名称和 logo
              会同步给学生端、教师端和管理端使用。默认留空时，各端只显示通用标题。
            </p>
          </div>

          {brandConfigLoading ? (
            <div className="success-banner">正在读取当前校区品牌配置...</div>
          ) : null}
          {brandError ? <div className="error-banner">{brandError}</div> : null}
          {brandSuccess ? (
            <div className="success-banner">{brandSuccess}</div>
          ) : null}

          <div className="ai-config-summary">
            <span
              className={`status-pill ${brandForm.brandName.trim() ? "active" : "draft"}`}
            >
              {brandForm.brandName.trim() ? "已设置品牌名" : "品牌名为空"}
            </span>
            <span>
              {brandForm.logoUrl.trim()
                ? "已配置 logo"
                : "logo 为空，展示默认图标"}
            </span>
            <span>
              {brandConfig?.updated_at
                ? `最近更新：${brandConfig.updated_at}`
                : "首次保存后会显示更新时间"}
            </span>
          </div>

          <form className="inline-form" onSubmit={handleBrandSubmit}>
            <label>
              品牌名称
              <input
                value={brandForm.brandName}
                onChange={(event) =>
                  setBrandForm((current) => ({
                    ...current,
                    brandName: event.target.value,
                  }))
                }
                placeholder="例如：某某英语 / 某某教育"
              />
              <span className="field-hint">
                留空时，各端使用通用标题，不展示机构名称。
              </span>
            </label>

            <label>
              Logo 地址
              <input
                value={brandForm.logoUrl}
                onChange={(event) =>
                  setBrandForm((current) => ({
                    ...current,
                    logoUrl: event.target.value,
                  }))
                }
                placeholder="例如：https://your-cdn/logo.png"
              />
              <span className="field-hint">
                支持公网图片地址，也可以直接上传 PNG、JPG、WebP 图片。
              </span>
            </label>

            <div className="span-2 brand-upload-panel">
              <div className="brand-upload-copy">
                <strong>直接上传 Logo 图片</strong>
                <p>
                  上传后会自动回填公开地址，你再点击保存即可同步到学生端、教师端和管理端。
                </p>
              </div>
              <div className="brand-upload-actions">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="brand-upload-input"
                  onChange={(event) => void handleLogoFileChange(event)}
                />
                <button
                  type="button"
                  className="ghost-button compact-button"
                  disabled={logoUploading || !selectedSchoolId}
                  onClick={() => logoFileInputRef.current?.click()}
                >
                  {logoUploading ? "处理中..." : "选择图片并裁剪"}
                </button>
                <span className="field-hint">
                  建议上传透明背景 PNG 或 WebP，大小不超过
                  2MB。上传前可以先裁剪。
                </span>
              </div>
            </div>

            <div className="span-2 school-brand-preview">
              <div className="school-brand-preview-card">
                {brandForm.logoUrl.trim() ? (
                  <div className="school-brand-logo-frame school-brand-logo-checker">
                    <img
                      src={brandForm.logoUrl.trim()}
                      alt={brandForm.brandName || "机构 Logo"}
                    />
                  </div>
                ) : (
                  <div className="school-brand-preview-fallback">LOGO</div>
                )}
                <div>
                  <strong>
                    {brandForm.brandName.trim() || "未设置品牌名称"}
                  </strong>
                  <p>教师端 / 管理端 / 学生端会统一读取这组配置。</p>
                </div>
              </div>

              {brandForm.logoUrl.trim() ? (
                <div className="school-brand-surface-grid">
                  <div className="school-brand-surface school-brand-logo-checker">
                    <img
                      src={brandForm.logoUrl.trim()}
                      alt={brandForm.brandName || "Logo 透明背景预览"}
                    />
                    <span>透明背景预览</span>
                  </div>
                  <div className="school-brand-surface school-brand-surface-dark">
                    <img
                      src={brandForm.logoUrl.trim()}
                      alt={brandForm.brandName || "Logo 深色背景预览"}
                    />
                    <span>深色背景预览</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="span-2 form-actions">
              <button
                type="button"
                className="ghost-button compact-button"
                disabled={
                  !brandForm.logoUrl.trim() ||
                  brandSaving ||
                  logoUploading ||
                  Boolean(logoEditor)
                }
                onClick={() => void handleClearLogo()}
              >
                一键清空当前 Logo
              </button>
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => {
                  setBrandError(null);
                  setBrandSuccess(null);
                  handleCancelLogoCrop();
                  setBrandForm(brandFormFromConfig(brandConfig));
                }}
              >
                恢复当前配置
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={
                  brandSaving ||
                  brandConfigLoading ||
                  logoUploading ||
                  Boolean(logoEditor)
                }
              >
                {brandSaving ? "正在保存..." : "保存应用品牌配置"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <h3>AI 接入配置</h3>
            <p>
              支持 OpenAI
              兼容接口，也可以配置其它厂商的官方地址。密钥只会加密保存，页面不会回显原文。
            </p>
          </div>

          {configLoading ? (
            <div className="success-banner">正在读取当前校区配置...</div>
          ) : null}
          {error ? <div className="error-banner">{error}</div> : null}
          {success ? <div className="success-banner">{success}</div> : null}

          <div className="ai-config-summary">
            <span
              className={`status-pill ${
                config ? (config.enabled ? "active" : "draft") : "draft"
              }`}
            >
              {config ? (config.enabled ? "已启用" : "已暂停") : "尚未配置"}
            </span>
            <span>
              {config?.apiKeyConfigured
                ? `已保存密钥 ${config.apiKeyMasked ?? ""}`
                : "还没有保存 API Key"}
            </span>
            <span>
              {config?.updatedAt
                ? `最近更新：${config.updatedAt}`
                : "首次保存后会显示更新时间"}
            </span>
          </div>

          <form className="inline-form" onSubmit={handleSubmit}>
            <label>
              API 协议类型
              <select
                value={form.providerType}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setForm((current) => ({
                    ...current,
                    providerType: nextType,
                    providerLabel:
                      current.providerLabel.trim() === "" ||
                      current.providerLabel ===
                        defaultLabelForProvider(current.providerType)
                        ? defaultLabelForProvider(nextType)
                        : current.providerLabel,
                  }));
                }}
              >
                {providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              接入名称
              <input
                value={form.providerLabel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    providerLabel: event.target.value,
                  }))
                }
                placeholder="例如：OpenAI 官方 / DeepSeek 校区专线"
              />
            </label>

            <label className="span-2">
              Base URL
              <input
                value={form.baseUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                placeholder="例如：https://api.openai.com/v1"
              />
              <span className="field-hint">
                可以填写官方接口，也可以填写你自己的代理网关地址。系统会按校区分别保存。
              </span>
            </label>

            <label>
              默认模型
              <input
                value={form.model}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
                placeholder="例如：gpt-4.1-mini / deepseek-chat"
              />
            </label>

            <label>
              启用状态
              <select
                value={form.enabled ? "enabled" : "disabled"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.value === "enabled",
                  }))
                }
              >
                <option value="enabled">启用</option>
                <option value="disabled">暂停</option>
              </select>
            </label>

            <label className="span-2">
              API Key
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }))
                }
                placeholder={
                  config?.apiKeyConfigured
                    ? "留空表示保持当前密钥不变"
                    : "首次保存必须填写"
                }
              />
              <span className="field-hint">
                {config?.apiKeyConfigured
                  ? `当前已保存：${config.apiKeyMasked ?? "••••"}，只有重新填写时才会替换。`
                  : "首次启用这个校区的 AI 能力时，需要先填写一次有效密钥。"}
              </span>
            </label>

            <div className="span-2 form-actions">
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  setForm(formFromConfig(config));
                }}
              >
                恢复当前配置
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={saving || configLoading}
              >
                {saving ? "正在保存..." : "保存校区 AI 配置"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <h3>语音模型配置</h3>
            <p>
              这套配置专门用于学生端“听示范”的语音生成。它和上面的评审模型分开保存，方便你单独切换
              TTS 服务。
            </p>
          </div>

          {speechConfigLoading ? (
            <div className="success-banner">正在读取当前校区语音配置...</div>
          ) : null}
          {speechError ? (
            <div className="error-banner">{speechError}</div>
          ) : null}
          {speechSuccess ? (
            <div className="success-banner">{speechSuccess}</div>
          ) : null}

          <div className="ai-config-summary">
            <span
              className={`status-pill ${
                speechConfig
                  ? speechConfig.enabled
                    ? "active"
                    : "draft"
                  : "draft"
              }`}
            >
              {speechConfig
                ? speechConfig.enabled
                  ? "已启用"
                  : "已暂停"
                : "尚未配置"}
            </span>
            <span>
              {speechConfig?.apiKeyConfigured
                ? `已保存密钥 ${speechConfig.apiKeyMasked ?? ""}`
                : "当前未保存 API Key（适用于无需密钥的语音服务）"}
            </span>
            <span>
              {speechConfig?.updatedAt
                ? `最近更新：${speechConfig.updatedAt}`
                : "首次保存后会显示更新时间"}
            </span>
          </div>

          <form className="inline-form" onSubmit={handleSpeechSubmit}>
            <label>
              API 协议类型
              <select
                value={speechForm.providerType}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setSpeechForm((current) => ({
                    ...current,
                    providerType: nextType,
                    providerLabel:
                      current.providerLabel.trim() === "" ||
                      current.providerLabel === "语音模型"
                        ? "语音模型"
                        : current.providerLabel,
                  }));
                }}
              >
                {providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              接入名称
              <input
                value={speechForm.providerLabel}
                onChange={(event) =>
                  setSpeechForm((current) => ({
                    ...current,
                    providerLabel: event.target.value,
                  }))
                }
                placeholder="例如：小米语音 / OpenAI TTS"
              />
            </label>

            <label className="span-2">
              Base URL
              <input
                value={speechForm.baseUrl}
                onChange={(event) =>
                  setSpeechForm((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                placeholder="例如：https://your-tts-gateway/v1"
              />
              <span className="field-hint">
                学生端会按这个地址请求 <code>/audio/speech</code>
                ，优先生成示范朗读。
              </span>
            </label>

            <label>
              语音模型
              <input
                value={speechForm.model}
                onChange={(event) =>
                  setSpeechForm((current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
                placeholder="例如：mimo-v2-tts"
              />
            </label>

            <label>
              Voice / 音色
              <input
                value={speechForm.voicePreset}
                onChange={(event) =>
                  setSpeechForm((current) => ({
                    ...current,
                    voicePreset: event.target.value,
                  }))
                }
                placeholder="可选，例如：alloy / female-1"
              />
            </label>

            <label>
              输出格式
              <input
                value={speechForm.responseFormat}
                onChange={(event) =>
                  setSpeechForm((current) => ({
                    ...current,
                    responseFormat: event.target.value,
                  }))
                }
                placeholder="mp3"
              />
            </label>

            <label>
              启用状态
              <select
                value={speechForm.enabled ? "enabled" : "disabled"}
                onChange={(event) =>
                  setSpeechForm((current) => ({
                    ...current,
                    enabled: event.target.value === "enabled",
                  }))
                }
              >
                <option value="enabled">启用</option>
                <option value="disabled">暂停</option>
              </select>
            </label>

            <label className="span-2">
              API Key
              <input
                type="password"
                value={speechForm.apiKey}
                onChange={(event) =>
                  setSpeechForm((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }))
                }
                placeholder={
                  speechConfig?.apiKeyConfigured
                    ? "留空表示保持当前密钥不变"
                    : "可留空，适用于无需密钥的语音服务"
                }
              />
              <span className="field-hint">
                {speechConfig?.apiKeyConfigured
                  ? `当前已保存：${speechConfig.apiKeyMasked ?? "••••"}。`
                  : "如果你的语音接口不需要密钥，这里可以留空。"}
              </span>
            </label>

            <div className="span-2 form-actions">
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => {
                  setSpeechError(null);
                  setSpeechSuccess(null);
                  setSpeechForm(formFromSpeechConfig(speechConfig));
                }}
              >
                恢复当前配置
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={speechSaving || speechConfigLoading}
              >
                {speechSaving ? "正在保存..." : "保存语音模型配置"}
              </button>
            </div>
          </form>
        </section>
      </div>

      {logoEditor ? (
        <div className="logo-cropper-backdrop">
          <div className="logo-cropper-dialog">
            <div className="panel-header">
              <h3>裁剪 Logo</h3>
              <p>调整缩放和位置，导出一个适合圆角图标位的正方形 Logo。</p>
            </div>

            <div className="logo-cropper-layout">
              <div className="logo-cropper-stage school-brand-logo-checker">
                <div className="logo-cropper-window">
                  <img
                    src={logoEditor.previewUrl}
                    alt="待裁剪的 Logo"
                    style={logoCropPreviewStyle}
                  />
                </div>
              </div>

              <div className="logo-cropper-controls">
                <label>
                  缩放
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={logoCropZoom}
                    onChange={(event) =>
                      setLogoCropZoom(Number(event.target.value))
                    }
                  />
                </label>

                <label>
                  左右位置
                  <input
                    type="range"
                    min={-logoCropBounds.maxOffsetX}
                    max={logoCropBounds.maxOffsetX}
                    step="1"
                    value={logoCropOffsetX}
                    disabled={logoCropBounds.maxOffsetX === 0}
                    onChange={(event) =>
                      setLogoCropOffsetX(Number(event.target.value))
                    }
                  />
                </label>

                <label>
                  上下位置
                  <input
                    type="range"
                    min={-logoCropBounds.maxOffsetY}
                    max={logoCropBounds.maxOffsetY}
                    step="1"
                    value={logoCropOffsetY}
                    disabled={logoCropBounds.maxOffsetY === 0}
                    onChange={(event) =>
                      setLogoCropOffsetY(Number(event.target.value))
                    }
                  />
                </label>

                <div className="logo-cropper-actions">
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => {
                      setLogoCropZoom(1);
                      setLogoCropOffsetX(0);
                      setLogoCropOffsetY(0);
                    }}
                  >
                    重置裁剪
                  </button>
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={handleCancelLogoCrop}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-button compact-button"
                    disabled={logoUploading}
                    onClick={() => void handleConfirmLogoCrop()}
                  >
                    {logoUploading ? "上传中..." : "确认裁剪并上传"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
