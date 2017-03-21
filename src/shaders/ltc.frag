
#define M_PI 3.1415926535897932384626433832795
#define LUT_SIZE 64.0

precision mediump float;
precision mediump int;

uniform sampler2D ltc_Minv;
uniform sampler2D ltc_Amp;
uniform vec3 w_light_corners[4];
uniform vec3 intensity;
uniform vec3 normalFresnel;
uniform vec3 cameraPosition;

uniform float use_merl;
uniform float roughness;

varying vec3 w_P;
varying vec3 w_N;

void ClipQuadToHorizon(inout vec3 L[5], out int n)
{
    // detect clipping config
    int config = 0;
    if (L[0].z > 0.0) config += 1;
    if (L[1].z > 0.0) config += 2;
    if (L[2].z > 0.0) config += 4;
    if (L[3].z > 0.0) config += 8;

    // clip
    n = 0;

    if (config == 0)
    {
        // clip all
    }
    else if (config == 1) // V1 clip V2 V3 V4
    {
        n = 3;
        L[1] = -L[1].z * L[0] + L[0].z * L[1];
        L[2] = -L[3].z * L[0] + L[0].z * L[3];
    }
    else if (config == 2) // V2 clip V1 V3 V4
    {
        n = 3;
        L[0] = -L[0].z * L[1] + L[1].z * L[0];
        L[2] = -L[2].z * L[1] + L[1].z * L[2];
    }
    else if (config == 3) // V1 V2 clip V3 V4
    {
        n = 4;
        L[2] = -L[2].z * L[1] + L[1].z * L[2];
        L[3] = -L[3].z * L[0] + L[0].z * L[3];
    }
    else if (config == 4) // V3 clip V1 V2 V4
    {
        n = 3;
        L[0] = -L[3].z * L[2] + L[2].z * L[3];
        L[1] = -L[1].z * L[2] + L[2].z * L[1];
    }
    else if (config == 5) // V1 V3 clip V2 V4) impossible
    {
        n = 0;
    }
    else if (config == 6) // V2 V3 clip V1 V4
    {
        n = 4;
        L[0] = -L[0].z * L[1] + L[1].z * L[0];
        L[3] = -L[3].z * L[2] + L[2].z * L[3];
    }
    else if (config == 7) // V1 V2 V3 clip V4
    {
        n = 5;
        L[4] = -L[3].z * L[0] + L[0].z * L[3];
        L[3] = -L[3].z * L[2] + L[2].z * L[3];
    }
    else if (config == 8) // V4 clip V1 V2 V3
    {
        n = 3;
        L[0] = -L[0].z * L[3] + L[3].z * L[0];
        L[1] = -L[2].z * L[3] + L[3].z * L[2];
        L[2] =  L[3];
    }
    else if (config == 9) // V1 V4 clip V2 V3
    {
        n = 4;
        L[1] = -L[1].z * L[0] + L[0].z * L[1];
        L[2] = -L[2].z * L[3] + L[3].z * L[2];
    }
    else if (config == 10) // V2 V4 clip V1 V3) impossible
    {
        n = 0;
    }
    else if (config == 11) // V1 V2 V4 clip V3
    {
        n = 5;
        L[4] = L[3];
        L[3] = -L[2].z * L[3] + L[3].z * L[2];
        L[2] = -L[2].z * L[1] + L[1].z * L[2];
    }
    else if (config == 12) // V3 V4 clip V1 V2
    {
        n = 4;
        L[1] = -L[1].z * L[2] + L[2].z * L[1];
        L[0] = -L[0].z * L[3] + L[3].z * L[0];
    }
    else if (config == 13) // V1 V3 V4 clip V2
    {
        n = 5;
        L[4] = L[3];
        L[3] = L[2];
        L[2] = -L[1].z * L[2] + L[2].z * L[1];
        L[1] = -L[1].z * L[0] + L[0].z * L[1];
    }
    else if (config == 14) // V2 V3 V4 clip V1
    {
        n = 5;
        L[4] = -L[0].z * L[3] + L[3].z * L[0];
        L[0] = -L[0].z * L[1] + L[1].z * L[0];
    }
    else if (config == 15) // V1 V2 V3 V4
    {
        n = 4;
    }
    
    if (n == 3)
        L[3] = L[0];
    if (n == 4)
        L[4] = L[0];
}

mat3 transpose(mat3 v)
{
    mat3 tmp;
    tmp[0] = vec3(v[0].x, v[1].x, v[2].x);
    tmp[1] = vec3(v[0].y, v[1].y, v[2].y);
    tmp[2] = vec3(v[0].z, v[1].z, v[2].z);

    return tmp;
}

float contourIntegral(vec3 p1, vec3 p2)
{
    float cosTheta = dot(p1, p2);
    cosTheta = clamp(cosTheta, -0.9999, 0.9999);
    float theta = acos(cosTheta);
    float res = cross(p1, p2).z * theta / sin(theta);
    return res;
}

float LTC_Evaluate(vec3 normal, vec3 view, vec3 position, mat3 Minv)
{
    // Construct tangent space around fragment
    vec3 tangent = normalize(view - normal * dot(normal, view));
    vec3 bitangent = normalize(cross(normal, tangent));

    mat3 TBN = mat3(tangent, bitangent, normal);
    Minv = Minv * transpose(TBN); // inverse

    // Transform to fitted space and project onto unit hemisphere
    vec3 t_light_corners[5];
    t_light_corners[0] = Minv * (w_light_corners[0] - position);
    t_light_corners[1] = Minv * (w_light_corners[1] - position);
    t_light_corners[2] = Minv * (w_light_corners[2] - position);
    t_light_corners[3] = Minv * (w_light_corners[3] - position);

    int n;
    ClipQuadToHorizon(t_light_corners, n);
    if (n == 0)
        return 0.0;

    t_light_corners[0] = normalize(t_light_corners[0]);
    t_light_corners[1] = normalize(t_light_corners[1]);
    t_light_corners[2] = normalize(t_light_corners[2]);
    t_light_corners[3] = normalize(t_light_corners[3]);
    t_light_corners[4] = normalize(t_light_corners[4]);

    float irradiance = 0.0;
    irradiance += contourIntegral(t_light_corners[0], t_light_corners[1]);
    irradiance += contourIntegral(t_light_corners[1], t_light_corners[2]);
    irradiance += contourIntegral(t_light_corners[2], t_light_corners[3]);
    if (n >= 4)
        irradiance += contourIntegral(t_light_corners[3], t_light_corners[4]);
    if (n == 5)
        irradiance += contourIntegral(t_light_corners[4], t_light_corners[0]);

    return abs(irradiance);
}

float MERL_Evaluate(vec3 normal, vec3 view, vec3 position, float r, float t)
{
    vec2 coords = vec2(r, t);
    coords = coords * (LUT_SIZE - 1.0) / LUT_SIZE + 0.5 / LUT_SIZE;
    vec4 tex = texture2D(ltc_Minv, coords);
    mat3 m = mat3(
        vec3(1.0, 0.0, tex.y),
        vec3(0.0, tex.z, 0.0),
        vec3(tex.w, 0.0, tex.x)
    );

    return LTC_Evaluate(normal, view, position, m) * texture2D(ltc_Amp, coords).a;
}

void main()
{
    vec3 view = normalize(cameraPosition - w_P);
    vec3 normal = normalize(w_N);
    float theta = acos(dot(normal, view));
    vec3 specular = vec3(0.0);

    float clamped_theta = clamp(theta / (0.5 * M_PI), 0.0, 1.0);
    if (use_merl > 0.5)
    {
        float r_spec = MERL_Evaluate(normal, view, w_P, 0.0, clamped_theta);
        float g_spec = MERL_Evaluate(normal, view, w_P, 0.5, clamped_theta);
        float b_spec = MERL_Evaluate(normal, view, w_P, 1.0, clamped_theta);
        specular = vec3(r_spec, g_spec, b_spec);
    }
    else
    {
        specular = vec3(MERL_Evaluate(normal, view, w_P, roughness, clamped_theta));
    }
    
    vec3 diffuse = vec3(LTC_Evaluate(normal, view, w_P, mat3(1.0)));

    vec3 color = (diffuse + specular) * intensity / (2.0 * M_PI);
    color = vec3(pow(color.x, (1.0 / 2.2)), pow(color.y, (1.0 / 2.2)), pow(color.z, (1.0 / 2.2)));
    gl_FragColor = vec4(color, 1.0);
}